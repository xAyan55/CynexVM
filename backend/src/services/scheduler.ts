import { db } from '../db';

export type SchedulerStrategy = 'least-cpu' | 'least-ram' | 'least-disk' | 'round-robin';

export class NodeScheduler {
  private static lastNodeIndex = 0;

  /**
   * Automatically selects the best node for container placement based on selected strategy
   */
  public static async selectNode(
    strategy: SchedulerStrategy,
    requirements: { cpuCores: number; memoryMb: number; storageGb: number }
  ): Promise<string> {
    const nodes = await db.node.findMany({
      where: {
        status: 'online',
        maintenanceMode: false
      },
      include: {
        instances: true
      }
    });

    if (nodes.length === 0) {
      throw new Error('No online, healthy host nodes available for deployment');
    }

    // Filter nodes with capacity limits
    const healthyNodes = nodes.filter(node => {
      const allocatedCpu = node.instances.reduce((acc, inst) => acc + inst.cpuCores, 0);
      const allocatedRam = node.instances.reduce((acc, inst) => acc + inst.memoryMb, 0);
      const allocatedDisk = node.instances.reduce((acc, inst) => acc + inst.storageGb, 0);

      // Check if new allocation exceeds hardware capacity
      const fitsCpu = node.cpuCores === 0 || (allocatedCpu + requirements.cpuCores) <= node.cpuCores;
      const fitsRam = node.memoryMb === 0 || (allocatedRam + requirements.memoryMb) <= node.memoryMb;
      const fitsDisk = node.storageGb === 0 || (allocatedDisk + requirements.storageGb) <= node.storageGb;

      return fitsCpu && fitsRam && fitsDisk;
    });

    const targetList = healthyNodes.length > 0 ? healthyNodes : nodes; // Fallback if limits are exceeded but we must select one

    switch (strategy) {
      case 'least-cpu':
        return targetList.sort((a, b) => {
          const aCpu = a.instances.reduce((acc, inst) => acc + inst.cpuCores, 0);
          const bCpu = b.instances.reduce((acc, inst) => acc + inst.cpuCores, 0);
          return aCpu - bCpu;
        })[0].id;

      case 'least-ram':
        return targetList.sort((a, b) => {
          const aRam = a.instances.reduce((acc, inst) => acc + inst.memoryMb, 0);
          const bRam = b.instances.reduce((acc, inst) => acc + inst.memoryMb, 0);
          return aRam - bRam;
        })[0].id;

      case 'least-disk':
        return targetList.sort((a, b) => {
          const aDisk = a.instances.reduce((acc, inst) => acc + inst.storageGb, 0);
          const bDisk = b.instances.reduce((acc, inst) => acc + inst.storageGb, 0);
          return aDisk - bDisk;
        })[0].id;

      case 'round-robin':
      default:
        const idx = this.lastNodeIndex % targetList.length;
        this.lastNodeIndex = (this.lastNodeIndex + 1) % targetList.length;
        return targetList[idx].id;
    }
  }
}
