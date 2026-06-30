import { LxdClient } from './lxdClient';

export class LxdImageService {
  /**
   * Lists all local cached images inside the node's LXD storage
   */
  public static async list(nodeId: string | null): Promise<any[]> {
    try {
      const data = await LxdClient.request(nodeId, '/1.0/images', 'GET');
      const fingerprints = data.map((url: string) => url.split('/').pop());

      const list = await Promise.all(
        fingerprints.map(async (fp: string) => {
          try {
            const info = await LxdClient.request(nodeId, `/1.0/images/${fp}`, 'GET');
            return {
              fingerprint: fp,
              sizeBytes: info.size || 0,
              uploadedAt: info.uploaded_at ? new Date(info.uploaded_at) : new Date(),
              aliases: info.aliases?.map((a: any) => a.name) || [],
              description: info.properties?.description || info.properties?.os || 'Linux Container OS Template'
            };
          } catch (_) {
            return null;
          }
        })
      );
      return list.filter(item => item !== null);
    } catch (_) {
      return [];
    }
  }

  /**
   * Pulls/Downloads a remote OS image alias into the local cache if missing
   */
  public static async downloadImage(nodeId: string | null, alias: string): Promise<void> {
    // Standard remote images server: images.lxd.canonical.com (mapped via 'images' server alias)
    await LxdClient.request(nodeId, '/1.0/images', 'POST', {
      source: {
        type: 'image',
        mode: 'pull',
        server: 'https://images.lxd.canonical.com',
        protocol: 'simplestreams',
        alias: alias
      },
      public: false
    });
  }
}
