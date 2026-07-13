import { db } from '../../db';
import { ConnectionManager } from './ConnectionManager';

export class HeartbeatMonitor {
  static process(nodeId: string, msg: any): void {
    db.node.update({
      where: { id: nodeId },
      data: {
        lastHeartbeat: new Date(),
        lastSeen: new Date(),
        status: 'online',
        cpuCores: msg.cpuCores || undefined,
        memoryMb: msg.memoryMb || undefined,
        storageGb: msg.storageGb || undefined,
        latency: msg.latency || 0,
        agentVersion: msg.agentVersion || '',
        osName: msg.osName || '',
        kernel: msg.kernel || '',
        uptime: msg.uptime || 0,
        containerCount: msg.containerCount || 0
      }
    }).catch(() => {});
  }

  static startMonitor(intervalMs = 30000): void {
    setInterval(() => this.checkStaleNodes(), intervalMs);
  }

  private static async checkStaleNodes(): Promise<void> {
    const staleTimeout = new Date(Date.now() - 75000);

    const staleNodes = await db.node.findMany({
      where: {
        status: 'online',
        lastHeartbeat: { lt: staleTimeout }
      }
    });

    for (const node of staleNodes) {
      const connected = ConnectionManager.isConnected(node.id);
      if (!connected) {
        await db.node.update({
          where: { id: node.id },
          data: { status: 'offline', lastSeen: new Date() }
        });
      }
    }
  }
}
