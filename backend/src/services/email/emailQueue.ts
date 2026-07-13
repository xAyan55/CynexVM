import { db } from '../../db';
import { EmailService } from './emailService';

const BACKOFF_DELAYS = [60, 120, 300, 900, 1800]; // 1m, 2m, 5m, 15m, 30m
const BATCH_SIZE = 10;
const POLL_INTERVAL = 5000;

export interface QueueStats {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  deadLetter: number;
  total: number;
  sentToday: number;
  deliveryRate: number;
}

export class EmailQueue {
  private static activePoller: NodeJS.Timeout | null = null;
  private static isPolling = false;
  private static initialized = false;
  private static isQueuePaused = false;

  public static async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Backward compatibility: Transition older queued/sending statuses to pending
    await db.emailLog.updateMany({
      where: { status: { in: ['sending', 'queued', 'processing'] } },
      data: {
        status: 'pending',
        nextRetryAt: new Date()
      }
    });

    // Mark stale jobs (no html body) as failed
    const staleCount = await db.emailLog.updateMany({
      where: { status: 'pending', html: null },
      data: { status: 'dead_letter', error: 'Stale job: missing HTML body' }
    });
    if (staleCount.count > 0) {
      console.log(`[Email Queue] Marked ${staleCount.count} stale jobs as dead_letter.`);
    }
  }

  public static start(): void {
    if (this.activePoller) return;
    console.log('[Email Queue] Starting background queue processor...');
    this.activePoller = setInterval(() => this.processQueue(), POLL_INTERVAL);
  }

  public static stop(): void {
    if (this.activePoller) {
      clearInterval(this.activePoller);
      this.activePoller = null;
    }
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
    subject: string;
    html: string;
    plainText?: string;
    templateName?: string;
    userId?: string;
    maxRetries?: number;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    // Deduplication check: Discard if identical email is already pending
    const existing = await db.emailLog.findFirst({
      where: {
        to: options.to,
        subject: options.subject,
        html: options.html,
        status: 'pending'
      }
    });

    if (existing) {
      console.log(`[Email Queue] Duplicate email to ${options.to} discarded (already pending in queue).`);
      return existing.id;
    }

    const log = await db.emailLog.create({
      data: {
        to: options.to,
        subject: options.subject,
        html: options.html,
        plainText: options.plainText || null,
        templateName: options.templateName || null,
        userId: options.userId || null,
        status: 'pending',
        maxRetries: options.maxRetries || 5,
        retryCount: 0,
        metadata: options.metadata ? JSON.stringify(options.metadata) : null
      }
    });
    return log.id;
  }

  public static async enqueueTemplate(
    to: string,
    templateName: string,
    variables: Record<string, unknown> = {},
    options?: { userId?: string; maxRetries?: number; metadata?: Record<string, unknown> }
  ): Promise<string | null> {
    const { EmailTemplateService } = require('./emailTemplateService');
    const template = await EmailTemplateService.getTemplate(templateName);
    if (!template) return null;

    const rendered = await EmailTemplateService.render(template, variables);
    return this.enqueue({
      to,
      subject: rendered.subject,
      html: rendered.html,
      plainText: rendered.plainText,
      templateName,
      userId: options?.userId,
      maxRetries: options?.maxRetries,
      metadata: options?.metadata
    });
  }

  private static async processQueue(): Promise<void> {
    if (this.isQueuePaused) return;
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const jobs = await db.emailLog.findMany({
        where: {
          status: { in: ['pending', 'failed'] },
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { lte: new Date() } }
          ]
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE
      });

      for (const job of jobs) {
        await this.processJob(job);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Poller error';
      console.error('[Email Queue] Poller error:', msg);
    } finally {
      this.isPolling = false;
    }
  }

  private static async processJob(job: any): Promise<void> {
    const ctx = `[Email Queue] Job ${job.id} (template=${job.templateName || 'none'}, to=${job.to}, subject=${job.subject})`;
    
    try {
      await db.emailLog.update({
        where: { id: job.id },
        data: { status: 'processing' }
      });

      if (!job.html) {
        await this.handleFailure(job, new Error('Missing HTML body'));
        return;
      }

      const result = await EmailService.sendRaw({
        to: job.to,
        subject: job.subject,
        html: job.html,
        plainText: job.plainText || undefined,
        smtpConfigId: undefined // uses default SmtpConfig
      });

      if (result.success) {
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
      } else {
        await this.handleFailure(job, new Error(result.error || 'SMTP delivery failed'));
      }
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error('Unknown sending exception');
      await this.handleFailure(job, errorObj);
    }
  }

  private static async handleFailure(job: any, error: Error): Promise<void> {
    const nextAttempt = job.retryCount + 1;
    const isPermanent = EmailService.isPermanentSmtpError(error.message);
    const isDeadLetter = isPermanent || nextAttempt >= job.maxRetries;

    const delaySec = BACKOFF_DELAYS[Math.min(job.retryCount, BACKOFF_DELAYS.length - 1)] || 1800;
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
        retryCount: nextAttempt,
        error: error.message.substring(0, 500),
        nextRetryAt: retryAfter,
        metadata: updatedMetadata
      }
    });

    if (isDeadLetter) {
      console.error(`[Email Queue] DLQ Delivery failure (${nextAttempt}/${job.maxRetries}): ${job.subject} -> ${job.to}: ${error.message} (Permanent: ${isPermanent})`);
    } else {
      console.warn(`[Email Queue] Transient delivery failure (${nextAttempt}/${job.maxRetries}). Retrying in ${delaySec}s: ${error.message}`);
    }
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

    return {
      pending,
      processing,
      sent,
      failed,
      deadLetter,
      total,
      sentToday,
      deliveryRate: total > 0 ? (sent / total) * 100 : 100
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
