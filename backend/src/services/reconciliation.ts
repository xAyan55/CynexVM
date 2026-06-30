import { db } from '../db';
import { LxdContainerService } from './lxd/lxdContainerService';

export class ReconciliationService {
  /**
   * Compares database records with real LXD container statuses on nodes
   */
  public static async run(): Promise<void> {
    try {
      const nodes = await db.node.findMany({
        include: { instances: true }
      });

      for (const node of nodes) {
        // Fetch real containers on node
        const realContainers = await LxdContainerService.list(node.id);
        const realNames = new Set(realContainers.map(c => c.name));

        for (const instance of node.instances) {
          const expectedName = `cynex-${instance.vmid}`;
          const exists = realNames.has(expectedName);

          if (!exists) {
            // Container missing: check if already flagged
            if (instance.status !== 'missing_alert') {
              console.warn(`[Reconciliation] Container ${expectedName} is missing on node ${node.name}. Flagging alert.`);
              await db.instance.update({
                where: { id: instance.id },
                data: { status: 'missing_alert' }
              });

              // Create Audit Log
              await db.auditLog.create({
                data: {
                  action: 'instance.reconcile_missing',
                  targetResourceId: instance.id,
                  targetResourceType: 'Instance',
                  details: `LXC container ${expectedName} is missing from node ${node.name}. Flagged for administrative recovery.`,
                  severity: 'critical',
                  success: false
                }
              });
            }
          } else {
            // Container exists: ensure status is synchronized
            const realContainer = realContainers.find(c => c.name === expectedName);
            const realStatus = realContainer?.status || 'stopped';
            
            if (instance.status !== realStatus) {
              await db.instance.update({
                where: { id: instance.id },
                data: { status: realStatus }
              });
            }
          }
        }
      }
    } catch (err: any) {
      console.error('[Reconciliation Error] Loop failed:', err.message);
    }
  }
}
