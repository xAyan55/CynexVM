import { db } from '../../db';
import { EmailService } from './emailService';

const BACKOFF_DELAYS = [60, 300, 900, 3600, 21600]; // 1m, 5m, 15m, 1h, 6h
const BATCH_SIZE = 10;
const POLL_INTERVAL = 5000;

export class EmailQueue {
  private static activePoller: NodeJS.Timeout | null = null;
  private static isPolling = false;
  private static initialized = false;

  public static async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    // Retry any jobs that were left in 'sending' state on last shutdown
    await db.emailLog.updateMany({
      where: { status: 'sending' },
      data: {
        status: 'queued',
        nextRetryAt: new Date(Date.now() + 60000)
      }
    });
  }

  public static start() {
    if (this.activePoller) return;
    console.log('[Email Queue] Starting background queue processor...');
    this.activePoller = setInterval(() => this.processQueue(), POLL_INTERVAL);
  }

  public static stop() {
    if (this.activePoller) {
      clearInterval(this.activePoller);
      this.activePoller = null;
    }
  }

  public static async enqueue(options: {
    to: string;
    subject: string;
    html: string;
    plainText?: string;
    templateName?: string;
    userId?: string;
    maxRetries?: number;
    metadata?: Record<string, any>;
  }): Promise<string> {
    const log = await db.emailLog.create({
      data: {
        to: options.to,
        subject: options.subject,
        templateName: options.templateName || null,
        userId: options.userId || null,
        status: 'queued',
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
    variables: Record<string, any> = {},
    options?: { userId?: string; maxRetries?: number; metadata?: Record<string, any> }
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

  private static async processQueue() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const jobs = await db.emailLog.findMany({
        where: {
          status: 'queued',
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
    } catch (err: any) {
      console.error('[Email Queue] Poller error:', err.message);
    } finally {
      this.isPolling = false;
    }
  }

  private static async processJob(job: any) {
    try {
      await db.emailLog.update({
        where: { id: job.id },
        data: { status: 'sending' }
      });

      const result = await EmailService.sendRaw({
        to: job.to,
        subject: job.subject,
        html: job.html,
        plainText: job.plainText || undefined
      });

      if (result.success) {
        await db.emailLog.update({
          where: { id: job.id },
          data: {
            status: 'sent',
            messageId: result.messageId || null,
            sentAt: new Date(),
            nextRetryAt: null
          }
        });
      } else {
        await this.handleFailure(job, result.error || 'Unknown error');
      }
    } catch (err: any) {
      await this.handleFailure(job, err.message || 'Unknown error');
    }
  }

  private static async handleFailure(job: any, error: string) {
    const nextAttempt = job.retryCount + 1;
    const isDeadLetter = nextAttempt >= job.maxRetries;
    const delaySec = BACKOFF_DELAYS[Math.min(job.retryCount, BACKOFF_DELAYS.length - 1)] || 3600;
    const retryAfter = isDeadLetter ? null : new Date(Date.now() + delaySec * 1000);

    await db.emailLog.update({
      where: { id: job.id },
      data: {
        status: isDeadLetter ? 'failed' : 'queued',
        retryCount: nextAttempt,
        error: error.substring(0, 500),
        nextRetryAt: retryAfter
      }
    });

    console.warn(`[Email Queue] Failed delivery (${nextAttempt}/${job.maxRetries}): ${job.subject} -> ${job.to}: ${error}`);
  }

  public static async getStats(): Promise<{
    queued: number;
    sending: number;
    sent: number;
    failed: number;
    bounced: number;
    total: number;
    sentToday: number;
    deliveryRate: number;
  }> {
    const [
      queued, sending, sent, failed, bounced, total, sentToday
    ] = await Promise.all([
      db.emailLog.count({ where: { status: 'queued' } }),
      db.emailLog.count({ where: { status: 'sending' } }),
      db.emailLog.count({ where: { status: 'sent' } }),
      db.emailLog.count({ where: { status: 'failed' } }),
      db.emailLog.count({ where: { status: 'bounced' } }),
      db.emailLog.count(),
      db.emailLog.count({
        where: {
          status: 'sent',
          sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    const delivered = sent + bounced;
    return {
      queued, sending, sent, failed, bounced, total,
      sentToday,
      deliveryRate: total > 0 ? (delivered / total) * 100 : 100
    };
  }

  public static async retryFailed(jobId: string): Promise<boolean> {
    const job = await db.emailLog.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'failed') return false;

    await db.emailLog.update({
      where: { id: jobId },
      data: {
        status: 'queued',
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
        status: 'queued',
        retryCount: 0,
        error: null,
        nextRetryAt: new Date()
      }
    });
    return result.count;
  }
}
