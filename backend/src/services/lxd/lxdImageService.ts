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
   * Resolves a user-facing OS template name to a proper simplestreams alias
   */
  private static resolveAlias(rawAlias: string): string {
    let alias = rawAlias.replace('images:', '');

    // Map common names to correct simplestreams aliases
    if (alias === 'ubuntu/22.04' || alias === 'ubuntu') alias = 'ubuntu/22.04';
    if (alias === 'debian/12' || alias === 'debian') alias = 'debian/12';
    if (alias === 'alpine/3.19' || alias === 'alpine') alias = 'alpine/3.19';

    // Append architecture if not already present
    if (!alias.includes('/amd64') && !alias.includes('/arm64') && !alias.includes('/i386')) {
      alias = `${alias}/amd64`;
    }

    return alias;
  }

  /**
   * Pulls/Downloads a remote OS image alias into the local cache if missing
   */
  public static async downloadImage(nodeId: string | null, alias: string): Promise<void> {
    const resolvedAlias = this.resolveAlias(alias);

    await LxdClient.request(nodeId, '/1.0/images', 'POST', {
      source: {
        type: 'image',
        mode: 'pull',
        server: 'https://images.lxd.canonical.com',
        protocol: 'simplestreams',
        alias: resolvedAlias
      },
      public: false
    });
  }
}
