import { LxdClient } from './lxdClient';

export class LxdStorageService {
  /**
   * Lists storage pools on the specified node
   */
  public static async list(nodeId: string | null): Promise<any[]> {
    try {
      const data = await LxdClient.request(nodeId, '/1.0/storage-pools', 'GET');
      const names = data.map((url: string) => url.split('/').pop());

      const pools = await Promise.all(
        names.map(async (name: string) => {
          try {
            const info = await LxdClient.request(nodeId, `/1.0/storage-pools/${name}`, 'GET');
            const resources = await LxdClient.request(nodeId, `/1.0/storage-pools/${name}/resources`, 'GET');
            const space = resources.space || {};
            return {
              name,
              driver: info.driver || 'dir',
              status: info.status || 'unknown',
              usedBytes: space.used || 0,
              totalBytes: space.total || 0,
              freeBytes: (space.total || 0) - (space.used || 0)
            };
          } catch (_) {
            return null;
          }
        })
      );
      return pools.filter(p => p !== null);
    } catch (_) {
      return [];
    }
  }

  /**
   * Validates if a storage pool has enough space for a new container allocation
   */
  public static async hasAvailableCapacity(nodeId: string | null, poolName: string, requestedGb: number): Promise<boolean> {
    try {
      const pools = await this.list(nodeId);
      const pool = pools.find(p => p.name === poolName) || pools[0];
      if (!pool) return true; // If no pools, skip and let LXD handle validation
      const requestedBytes = requestedGb * 1024 * 1024 * 1024;
      return pool.freeBytes >= requestedBytes || pool.driver === 'dir';
    } catch (_) {
      return true; // Fallback
    }
  }
}
