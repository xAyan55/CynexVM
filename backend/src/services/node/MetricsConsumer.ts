import { db } from '../../db';

export class MetricsConsumer {
  private static buffer: any[] = [];
  private static flushInterval: NodeJS.Timeout | null = null;

  static ingest(nodeId: string, msg: any): void {
    this.buffer.push({
      nodeId,
      cpuPct: msg.cpuPct || 0,
      ramMb: msg.ramMb || 0,
      diskGb: msg.diskGb || 0,
      rxBytes: BigInt(msg.rxBytes || 0),
      txBytes: BigInt(msg.txBytes || 0),
      loadAvg: msg.loadAvg || 0,
      containerCount: msg.containerCount || 0,
      recordedAt: new Date()
    });

    if (!this.flushInterval) {
      this.flushInterval = setInterval(() => this.flush(), 60000);
    }
  }

  private static async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);

    try {
      await db.nodeMetric.createMany({ data: batch });
    } catch {
      this.buffer.unshift(...batch);
    }
  }

  static async getRecent(nodeId: string, minutes = 60): Promise<any[]> {
    const since = new Date(Date.now() - minutes * 60000);
    return db.nodeMetric.findMany({
      where: { nodeId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' }
    });
  }
}
