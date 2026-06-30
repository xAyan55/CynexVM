import { LxdClient } from './lxdClient';

export class LxdNetworkService {
  /**
   * Lists network bridge profiles on the node
   */
  public static async list(nodeId: string | null): Promise<any[]> {
    try {
      const data = await LxdClient.request(nodeId, '/1.0/networks', 'GET');
      const names = data.map((url: string) => url.split('/').pop());

      const networks = await Promise.all(
        names.map(async (name: string) => {
          try {
            const info = await LxdClient.request(nodeId, `/1.0/networks/${name}`, 'GET');
            return {
              name,
              type: info.type || 'bridge',
              status: info.status || 'unknown',
              usedBy: info.used_by?.length || 0,
              ipv4Address: info.config?.['ipv4.address'] || 'none',
              ipv6Address: info.config?.['ipv6.address'] || 'none',
              ipv4Nat: info.config?.['ipv4.nat'] === 'true'
            };
          } catch (_) {
            return null;
          }
        })
      );
      return networks.filter(n => n !== null);
    } catch (_) {
      return [];
    }
  }
}
