import { db } from '../../db';

export interface EmailLogData {
  id: string;
  userId: string | null;
  to: string;
  subject: string;
  html: string | null;
  plainText: string | null;
  templateName: string | null;
  status: string;
  error: string | null;
  messageId: string | null;
  openedAt: Date | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date | null;
  metadata: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    username: string;
    email: string;
  } | null;
}

export class EmailLogService {
  public static async listLogs(options: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ items: EmailLogData[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (options.status) where.status = options.status;
    if (options.userId) where.userId = options.userId;
    if (options.search) {
      where.OR = [
        { to: { contains: options.search } },
        { subject: { contains: options.search } },
        { templateName: { contains: options.search } }
      ];
    }
    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = new Date(options.startDate);
      if (options.endDate) where.createdAt.lte = new Date(options.endDate);
    }

    const [items, total] = await Promise.all([
      db.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, username: true, email: true } }
        }
      }),
      db.emailLog.count({ where })
    ]);

    return {
      items: items.map(item => ({
        ...item,
        user: item.user || null
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  public static async getLogById(id: string): Promise<EmailLogData | null> {
    const log = await db.emailLog.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, email: true } }
      }
    });
    if (!log) return null;
    return {
      ...log,
      user: log.user || null
    };
  }

  public static async deleteLog(id: string): Promise<boolean> {
    try {
      await db.emailLog.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  public static async purgeOldLogs(daysRetention: number = 90): Promise<number> {
    const cutoff = new Date(Date.now() - daysRetention * 24 * 60 * 60 * 1000);
    const result = await db.emailLog.deleteMany({
      where: { createdAt: { lte: cutoff } }
    });
    return result.count;
  }

  public static async getAnalytics(options?: { days?: number }): Promise<any> {
    const days = options?.days || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      totalSent, totalFailed, totalDeadLetter, totalPending,
      totalProcessing,
      todaySent, todayFailed,
      recentLogs,
      templateStats,
      allLogsForPeriod
    ] = await Promise.all([
      db.emailLog.count({ where: { status: 'sent', createdAt: { gte: startDate } } }),
      db.emailLog.count({ where: { status: 'failed', createdAt: { gte: startDate } } }),
      db.emailLog.count({ where: { status: 'dead_letter', createdAt: { gte: startDate } } }),
      db.emailLog.count({ where: { status: 'pending' } }),
      db.emailLog.count({ where: { status: 'processing' } }),
      db.emailLog.count({ where: { status: 'sent', createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      db.emailLog.count({ where: { status: 'dead_letter', createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      db.emailLog.findMany({
        where: { createdAt: { gte: startDate } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { createdAt: true, status: true, to: true, subject: true }
      }),
      db.emailLog.groupBy({
        by: ['templateName'],
        where: { createdAt: { gte: startDate }, templateName: { not: null } },
        _count: { id: true }
      }),
      db.emailLog.findMany({
        where: { createdAt: { gte: startDate } },
        select: { to: true, status: true, metadata: true, retryCount: true }
      })
    ]);

    // Domain and send time processing
    let totalSendTime = 0;
    let countedSendTimes = 0;
    let totalRetries = 0;

    const domainsMap = new Map<string, number>();
    let gmailCount = 0;
    let outlookCount = 0;
    let yahooCount = 0;
    let otherCount = 0;

    for (const log of allLogsForPeriod) {
      totalRetries += log.retryCount;
      
      // Parse email domain
      const email = log.to.toLowerCase();
      const domain = email.includes('@') ? email.split('@')[1] : 'unknown';
      domainsMap.set(domain, (domainsMap.get(domain) || 0) + 1);

      if (domain.includes('gmail.com') || domain.includes('googlemail.com')) {
        gmailCount++;
      } else if (domain.includes('outlook.com') || domain.includes('hotmail.com') || domain.includes('live.com') || domain.includes('office365')) {
        outlookCount++;
      } else if (domain.includes('yahoo.com')) {
        yahooCount++;
      } else {
        otherCount++;
      }

      // Parse metadata for sending latency
      if (log.metadata) {
        try {
          const meta = JSON.parse(log.metadata);
          if (meta.elapsedTimeMs && typeof meta.elapsedTimeMs === 'number') {
            totalSendTime += meta.elapsedTimeMs;
            countedSendTimes++;
          }
        } catch {}
      }
    }

    const totalLogsForPeriod = allLogsForPeriod.length;
    const gmailPercent = totalLogsForPeriod > 0 ? Math.round((gmailCount / totalLogsForPeriod) * 100) : 0;
    const outlookPercent = totalLogsForPeriod > 0 ? Math.round((outlookCount / totalLogsForPeriod) * 100) : 0;
    const yahooPercent = totalLogsForPeriod > 0 ? Math.round((yahooCount / totalLogsForPeriod) * 100) : 0;
    const otherPercent = totalLogsForPeriod > 0 ? Math.round((otherCount / totalLogsForPeriod) * 100) : 0;

    const avgSendTime = countedSendTimes > 0 ? Math.round(totalSendTime / countedSendTimes) : 0;

    const topDomains = Array.from(domainsMap.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Daily counts for charts
    const dailyMap = new Map<string, { sent: number; failed: number; deadLetter: number }>();
    for (const log of recentLogs) {
      const day = log.createdAt.toISOString().slice(0, 10);
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { sent: 0, failed: 0, deadLetter: 0 });
      }
      const entry = dailyMap.get(day)!;
      if (log.status === 'sent') entry.sent++;
      else if (log.status === 'failed') entry.failed++;
      else if (log.status === 'dead_letter') entry.deadLetter++;
    }

    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalProcessed = totalSent + totalFailed + totalDeadLetter;
    const totalDelivered = totalSent;

    return {
      period: { days, startDate },
      summary: {
        totalSent,
        totalFailed,
        totalDeadLetter,
        totalPending,
        totalProcessing,
        todaySent,
        todayFailed,
        totalProcessed,
        averageSendTimeMs: avgSendTime,
        totalRetries,
        deliveryRate: totalProcessed > 0 ? (totalDelivered / totalProcessed) * 100 : 100
      },
      clientBreakdown: {
        gmail: gmailPercent,
        outlook: outlookPercent,
        yahoo: yahooPercent,
        others: otherPercent
      },
      dailyStats,
      templateStats: (templateStats as any[]).map((t: any) => ({
        template: t.templateName,
        count: t._count.id
      })),
      topDomains
    };
  }

  public static async resendEmail(jobId: string): Promise<boolean> {
    const job = await db.emailLog.findUnique({ where: { id: jobId } });
    if (!job) return false;

    await db.emailLog.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        retryCount: 0,
        error: null,
        nextRetryAt: new Date(),
        sentAt: null,
        messageId: null
      }
    });
    return true;
  }
}
