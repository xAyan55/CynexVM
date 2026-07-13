import { db } from '../../db';

export class EmailLogService {
  public static async listLogs(options: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ items: any[]; total: number; page: number; limit: number; totalPages: number }> {
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
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  public static async getLogById(id: string): Promise<any> {
    return db.emailLog.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, email: true } }
      }
    });
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
      totalSent, totalFailed, totalBounced, totalQueued,
      totalSending,
      todaySent, todayFailed,
      recentLogs,
      topRecipients,
      templateStats
    ] = await Promise.all([
      db.emailLog.count({ where: { status: 'sent', createdAt: { gte: startDate } } }),
      db.emailLog.count({ where: { status: 'failed', createdAt: { gte: startDate } } }),
      db.emailLog.count({ where: { status: 'bounced', createdAt: { gte: startDate } } }),
      db.emailLog.count({ where: { status: 'queued' } }),
      db.emailLog.count({ where: { status: 'sending' } }),
      db.emailLog.count({ where: { status: 'sent', createdAt: { gte: new Date(Date.now() - 86400000) } } }),
      db.emailLog.count({ where: { status: 'failed', createdAt: { gte: new Date(Date.now() - 86400000) } } }),
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
      db.emailLog.groupBy({
        by: ['to'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10
      })
    ]);

    // Daily counts for charts
    const dailyMap = new Map<string, { sent: number; failed: number; bounced: number }>();
    for (const log of recentLogs) {
      const day = log.createdAt.toISOString().slice(0, 10);
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { sent: 0, failed: 0, bounced: 0 });
      }
      const entry = dailyMap.get(day)!;
      if (log.status === 'sent') entry.sent++;
      else if (log.status === 'failed') entry.failed++;
      else if (log.status === 'bounced') entry.bounced++;
    }

    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalDelivered = totalSent + totalBounced;
    const totalProcessed = totalSent + totalFailed + totalBounced;

    return {
      period: { days, startDate },
      summary: {
        totalSent,
        totalFailed,
        totalBounced,
        totalQueued,
        totalSending,
        todaySent,
        todayFailed,
        totalProcessed,
        deliveryRate: totalProcessed > 0 ? (totalDelivered / totalProcessed) * 100 : 100
      },
      dailyStats,
      templateStats: (templateStats as any[]).map((t: any) => ({
        template: t.templateName,
        count: t._count.id
      })),
      topRecipients: (topRecipients as any[]).map((t: any) => ({
        email: t.to,
        count: t._count.id
      }))
    };
  }

  public static async resendEmail(jobId: string): Promise<boolean> {
    const job = await db.emailLog.findUnique({ where: { id: jobId } });
    if (!job) return false;

    await db.emailLog.update({
      where: { id: jobId },
      data: {
        status: 'queued',
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
