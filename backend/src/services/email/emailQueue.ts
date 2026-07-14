import { db } from '../../db';
import { EmailService } from './emailService';

export interface QueueStats {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  deadLetter: number;
  total: number;
  sentToday: number;
  deliveryRate: number;
  averageSendTimeMs: number;
  oldestPendingCreatedAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  activeWorkers: number;
}

export class EmailQueue {
  private static activePoller: NodeJS.Timeout | null = null;
  private static isPolling = false;
  private static initialized = false;
  private static isQueuePaused = false;

  // Worker Concurrency & Graceful Shutdown Settings
  private static activeCount = 0;
  private static readonly CONCURRENCY = 5;
  private static isStopping = false;

  // Queue Metrics
  private static sendTimes: number[] = [];
  private static lastSuccessAt: Date | null = null;
  private static lastFailureAt: Date | null = null;

  public static recordSendTime(ms: number) {
    this.sendTimes.push(ms);
    if (this.sendTimes.length > 100) {
      this.sendTimes.shift();
    }
    this.lastSuccessAt = new Date();
  }

  public static recordFailure() {
    this.lastFailureAt = new Date();
  }

  public static async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    console.log('[Email Queue] Initializing email queue subsystem...');

    // 1. Stuck Job Startup Recovery (older than 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stuckJobs = await db.emailLog.updateMany({
      where: {
        status: 'processing',
        updatedAt: { lte: tenMinutesAgo }
      },
      data: {
        status: 'pending',
        nextRetryAt: new Date(),
        error: 'Stuck job recovery: reset to pending'
      }
    });
    if (stuckJobs.count > 0) {
      console.log(`[Email Queue] Recovered ${stuckJobs.count} stuck 'processing' jobs back to 'pending'.`);
    }

    // 2. Backward compatibility: Transition legacy active statuses to pending
    await db.emailLog.updateMany({
      where: { status: { in: ['sending', 'queued', 'processing'] } },
      data: {
        status: 'pending',
        nextRetryAt: new Date()
      }
    });

    // 3. Startup repair & validation of pending/processing/failed legacy queue jobs
    const legacyJobs = await db.emailLog.findMany({
      where: {
        status: { in: ['pending', 'processing', 'failed'] }
      }
    });

    for (const job of legacyJobs) {
      let isDeadLetter = false;
      let reason = '';
      let renderedSuccessfully = true;

      // Handle legacy SMTP error classifications manually if present
      const hasOldSmtpErrors = job.error && (
        job.error.includes('ssl3_get_record') ||
        job.error.includes('wrong version number') ||
        job.error.includes('ENETUNREACH') ||
        job.error.includes('Missing HTML body')
      );

      if (hasOldSmtpErrors) {
        isDeadLetter = true;
        reason = `Stale SMTP configuration error: ${job.error}`;
      } else if (!job.to || typeof job.to !== 'string' || job.to.trim().length === 0 || !job.to.includes('@')) {
        isDeadLetter = true;
        reason = 'Email Validation Failed: Invalid or missing recipient';
      } else if (!job.subject || typeof job.subject !== 'string' || job.subject.trim().length === 0) {
        isDeadLetter = true;
        reason = 'Email Validation Failed: Missing subject';
      } else {
        // If html is missing, try to re-render if templateName is present and we have metadata variables
        let html = job.html || '';
        if (html.trim().length === 0) {
          if (job.templateName) {
            try {
              const { EmailTemplateService } = require('./emailTemplateService');
              const template = await EmailTemplateService.getTemplate(job.templateName);
              if (!template) {
                isDeadLetter = true;
                reason = `Email Validation Failed: Template '${job.templateName}' not found`;
                renderedSuccessfully = false;
              } else {
                let variables: Record<string, any> = {};
                if (job.metadata) {
                  try {
                    const parsed = JSON.parse(job.metadata);
                    if (parsed && typeof parsed === 'object') {
                      variables = parsed.variables || parsed;
                    }
                  } catch {}
                }
                const rendered = await EmailTemplateService.render(template, variables);
                html = rendered.html;
                job.html = html;
                job.plainText = rendered.plainText || job.plainText;
                
                await db.emailLog.update({
                  where: { id: job.id },
                  data: {
                    html: html,
                    plainText: job.plainText,
                    subject: job.subject || rendered.subject
                  }
                });
              }
            } catch (err: any) {
              isDeadLetter = true;
              reason = `Email Validation Failed: Template rendering failed: ${err.message}`;
              renderedSuccessfully = false;
            }
          } else {
            isDeadLetter = true;
            reason = 'Email Validation Failed: Missing HTML body';
            renderedSuccessfully = false;
          }
        }

        if (!isDeadLetter && (!html || html.trim().length === 0)) {
          isDeadLetter = true;
          reason = 'Email Validation Failed: Missing HTML body';
        }
      }

      if (isDeadLetter) {
        this.logValidationFailure(job, renderedSuccessfully);
        await db.emailLog.update({
          where: { id: job.id },
          data: {
            status: 'dead_letter',
            error: reason.substring(0, 500),
            retryCount: job.maxRetries,
            nextRetryAt: null
          }
        });
      }
    }
  }

  public static start(): void {
    if (this.activePoller) return;
    this.isStopping = false;
    console.log('[Email Queue] Starting background queue processor...');
    this.activePoller = setInterval(() => this.processQueue(), 5000);
  }

  public static async stop(): Promise<void> {
    this.isStopping = true;
    if (this.activePoller) {
      clearInterval(this.activePoller);
      this.activePoller = null;
    }
    console.log('[Email Queue] Stopping queue processor. Waiting for active sends to finish...');
    while (this.activeCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('[Email Queue] Queue processor stopped cleanly.');
  }

  public static pause(): void {
    this.isQueuePaused = true;
    console.log('[Email Queue] Queue processing has been paused.');
  }

  public static resume(): void {
    this.isQueuePaused = false;
    console.log('[Email Queue] Queue processing has been resumed.');
  }

  public static isPaused(): boolean {
    return this.isQueuePaused;
  }

  public static async enqueue(options: {
    to: string;
    subject?: string;
    html?: string;
    plainText?: string;
    templateName?: string;
    variables?: Record<string, unknown>;
    userId?: string;
    maxRetries?: number;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    // 1. Enforce strict inputs validation
    if (!options.to || typeof options.to !== 'string' || options.to.trim().length === 0 || !options.to.includes('@')) {
      throw new Error('Email Validation Failed: Invalid Recipient');
    }

    let subject = options.subject || '';
    let html = options.html || '';
    let plainText = options.plainText || '';

    // 2. Render templates immediately at enqueue time (Immutability check)
    if ((!html || html.trim().length === 0) && options.templateName) {
      const { EmailTemplateService } = require('./emailTemplateService');
      
      // Block sending/enqueueing if template is marked invalid in memory
      if (EmailTemplateService.isTemplateInvalid(options.templateName)) {
        throw new Error(`Email Validation Failed: Template '${options.templateName}' is currently invalid and blocked.`);
      }

      const template = await EmailTemplateService.getTemplate(options.templateName);
      if (!template) {
        throw new Error(`Email Validation Failed: Template '${options.templateName}' not found`);
      }

      try {
        const rendered = await EmailTemplateService.render(template, options.variables || {});
        html = rendered.html;
        if (!subject) subject = rendered.subject;
        if (!plainText) plainText = rendered.plainText || '';
      } catch (err: any) {
        throw new Error(`Email Validation Failed: Template render failed: ${err.message}`);
      }
    }

    // 3. Final validation before insertion
    if (typeof html !== 'string' || html.trim().length === 0) {
      throw new Error('Email Validation Failed: Missing HTML body');
    }
    if (typeof subject !== 'string' || subject.trim().length === 0) {
      throw new Error('Email Validation Failed: Missing Subject');
    }

    const metadataObj = options.metadata || {};
    const idempotencyKey = (options as any).idempotencyKey || metadataObj.idempotencyKey || metadataObj.notificationId;

    // 4. Metadata-based Idempotency check (No recipient/subject/body duplicate check)
    if (idempotencyKey) {
      const existing = await db.emailLog.findFirst({
        where: {
          status: 'pending',
          metadata: {
            contains: String(idempotencyKey)
          }
        }
      });

      if (existing) {
        console.log(`[Email Pipeline] Duplicate email to ${options.to} discarded (already pending in queue with idempotencyKey: ${idempotencyKey}).`);
        return existing.id;
      }
    }

    const mergedMetadata = {
      ...metadataObj,
      ...(idempotencyKey ? { idempotencyKey } : {})
    };

    const log = await db.emailLog.create({
      data: {
        to: options.to,
        subject,
        html,
        plainText: plainText || null,
        templateName: options.templateName || null,
        userId: options.userId || null,
        status: 'pending',
        maxRetries: options.maxRetries || 5,
        retryCount: 0,
        metadata: JSON.stringify(mergedMetadata)
      }
    });

    console.log(`[Email Pipeline] [Job: ${log.id}] [Notification: ${metadataObj.notificationId || 'none'}] Queue Inserted. Status: pending`);
    return log.id;
  }

  public static async enqueueTemplate(
    to: string,
    templateName: string,
    variables: Record<string, unknown> = {},
    options?: { userId?: string; maxRetries?: number; metadata?: Record<string, unknown> }
  ): Promise<string | null> {
    return this.enqueue({
      to,
      templateName,
      variables,
      userId: options?.userId,
      maxRetries: options?.maxRetries,
      metadata: options?.metadata
    });
  }

  private static async processQueue(): Promise<void> {
    if (this.isQueuePaused || this.isStopping) return;
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      // Concurrency Worker Pool loop
      while (this.activeCount < this.CONCURRENCY && !this.isStopping && !this.isQueuePaused) {
        const job = await this.acquireNextJob();
        if (!job) break; // No pending jobs available or all locked by other workers

        this.activeCount++;
        this.processJob(job).finally(() => {
          this.activeCount--;
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Poller error';
      console.error('[Email Queue] Poller error:', msg);
    } finally {
      this.isPolling = false;
    }
  }

  // Atomic Lock Transaction: Find oldest pending/failed ready job and update to processing atomically
  private static async acquireNextJob(): Promise<any | null> {
    return db.$transaction(async (tx) => {
      const pendingJob = await tx.emailLog.findFirst({
        where: {
          status: { in: ['pending', 'failed'] },
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { lte: new Date() } }
          ]
        },
        orderBy: { createdAt: 'asc' }
      });

      if (!pendingJob) return null;

      const affected = await tx.emailLog.updateMany({
        where: {
          id: pendingJob.id,
          status: { in: ['pending', 'failed'] }
        },
        data: {
          status: 'processing'
        }
      });

      if (affected.count === 1) {
        return pendingJob;
      }
      return null;
    });
  }

  private static async processJob(job: any): Promise<void> {
    console.log(`[Email Pipeline] [Job: ${job.id}] Queue Processing. Status: processing`);
    const start = Date.now();

    try {
      // Defensive validation for corrupted legacy rows
      const toValid = job.to && typeof job.to === 'string' && job.to.trim().length > 0 && job.to.includes('@');
      const subjectValid = job.subject && typeof job.subject === 'string' && job.subject.trim().length > 0;
      const htmlValid = job.html && typeof job.html === 'string' && job.html.trim().length > 0;

      if (!toValid || !subjectValid || !htmlValid) {
        let errorMsg = 'Email Validation Failed:';
        if (!toValid) errorMsg += ' Invalid/Missing Recipient.';
        if (!subjectValid) errorMsg += ' Missing Subject.';
        if (!htmlValid) errorMsg += ' Missing HTML body.';
        throw new Error(errorMsg);
      }

      console.log(`[Email Pipeline] [Job: ${job.id}] SMTP Sending. Recipient: ${job.to}`);

      const result = await EmailService.sendRaw({
        to: job.to,
        subject: job.subject,
        html: job.html,
        plainText: job.plainText || undefined,
        smtpConfigId: undefined
      });

      if (result.success) {
        this.recordSendTime(Date.now() - start);
        await db.emailLog.update({
          where: { id: job.id },
          data: {
            status: 'sent',
            messageId: result.messageId || null,
            sentAt: new Date(),
            nextRetryAt: null,
            metadata: result.metadata || job.metadata
          }
        });
        console.log(`[Email Pipeline] [Job: ${job.id}] SMTP Success. Message ID: ${result.messageId}`);
      } else {
        throw new Error(result.error || 'SMTP delivery failed');
      }
    } catch (err: any) {
      await this.handleFailure(job, err);
    }
  }

  public static isPermanentValidationError(errorMsg: string): boolean {
    const msg = errorMsg.toLowerCase();
    return (
      msg.includes('validation') ||
      msg.includes('missing') ||
      msg.includes('invalid') ||
      msg.includes('template not found')
    );
  }

  private static async handleFailure(job: any, error: Error): Promise<void> {
    const nextAttempt = job.retryCount + 1;
    const isPermanent = EmailService.classifyError(error) === 'permanent' || this.isPermanentValidationError(error.message);
    const isDeadLetter = isPermanent || nextAttempt >= job.maxRetries;

    const delaySec = [60, 120, 300, 900, 1800][Math.min(job.retryCount, 4)] || 1800;
    const retryAfter = isDeadLetter ? null : new Date(Date.now() + delaySec * 1000);

    const metadataObj = job.metadata ? JSON.parse(job.metadata) : {};
    const updatedMetadata = JSON.stringify({
      ...metadataObj,
      error: error.message,
      stackTrace: error.stack || '',
      attemptCount: nextAttempt,
      timestamp: new Date().toISOString(),
      smtpResponse: error.message
    });

    await db.emailLog.update({
      where: { id: job.id },
      data: {
        status: isDeadLetter ? 'dead_letter' : 'failed',
        retryCount: isDeadLetter ? job.maxRetries : nextAttempt,
        error: error.message.substring(0, 500),
        nextRetryAt: retryAfter,
        metadata: updatedMetadata
      }
    });

    this.recordFailure();

    console.log(`[Email Pipeline] [Job: ${job.id}] SMTP Failure. Attempt: ${nextAttempt}/${job.maxRetries}. Error: ${error.message}. Classification: ${isPermanent ? 'Permanent' : 'Transient'}. Queue Status: ${isDeadLetter ? 'Dead Letter' : 'Failed'}`);
  }

  private static logValidationFailure(job: any, renderedSuccessfully: boolean): void {
    const htmlPresent = (job.html && job.html.trim().length > 0) ? 'Yes' : 'No';
    const textPresent = (job.plainText && job.plainText.trim().length > 0) ? 'Yes' : 'No';
    console.error(`Email Validation Failed
Job ID: ${job.id}
Template: ${job.templateName || 'None'}
Recipient: ${job.to || 'None'}
Subject: ${job.subject || 'None'}

HTML Present: ${htmlPresent}
Text Present: ${textPresent}
Rendered Successfully: ${renderedSuccessfully ? 'Yes' : 'No'}
Queue Status: Dead Letter`);
  }

  public static async getStats(): Promise<QueueStats> {
    const [
      pending, processing, sent, failed, deadLetter, total, sentToday
    ] = await Promise.all([
      db.emailLog.count({ where: { status: 'pending' } }),
      db.emailLog.count({ where: { status: 'processing' } }),
      db.emailLog.count({ where: { status: 'sent' } }),
      db.emailLog.count({ where: { status: 'failed' } }),
      db.emailLog.count({ where: { status: 'dead_letter' } }),
      db.emailLog.count(),
      db.emailLog.count({
        where: {
          status: 'sent',
          sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    const oldestPending = await db.emailLog.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true }
    });

    const avgSendTime = this.sendTimes.length > 0
      ? this.sendTimes.reduce((a, b) => a + b, 0) / this.sendTimes.length
      : 0;

    return {
      pending,
      processing,
      sent,
      failed,
      deadLetter,
      total,
      sentToday,
      deliveryRate: total > 0 ? (sent / total) * 100 : 100,
      averageSendTimeMs: Math.round(avgSendTime),
      oldestPendingCreatedAt: oldestPending?.createdAt || null,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      activeWorkers: this.activeCount
    };
  }

  public static async retryFailed(jobId: string): Promise<boolean> {
    const job = await db.emailLog.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'failed') return false;

    await db.emailLog.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        retryCount: 0,
        error: null,
        nextRetryAt: new Date()
      }
    });
    return true;
  }

  public static async retryAllFailed(): Promise<number> {
    const result = await db.emailLog.updateMany({
      where: { status: 'failed' },
      data: {
        status: 'pending',
        retryCount: 0,
        error: null,
        nextRetryAt: new Date()
      }
    });
    return result.count;
  }

  public static async retryDeadLetters(): Promise<number> {
    const result = await db.emailLog.updateMany({
      where: { status: 'dead_letter' },
      data: {
        status: 'pending',
        retryCount: 0,
        error: null,
        nextRetryAt: new Date()
      }
    });
    return result.count;
  }

  public static async purgeQueue(): Promise<number> {
    const result = await db.emailLog.deleteMany({
      where: { status: { in: ['pending', 'processing', 'failed'] } }
    });
    return result.count;
  }

  public static async cancelPending(): Promise<number> {
    const result = await db.emailLog.updateMany({
      where: { status: 'pending' },
      data: {
        status: 'dead_letter',
        error: 'Cancelled by Administrator',
        nextRetryAt: null
      }
    });
    return result.count;
  }

  public static async clearDeadLetters(): Promise<number> {
    const result = await db.emailLog.deleteMany({
      where: { status: 'dead_letter' }
    });
    return result.count;
  }
}
