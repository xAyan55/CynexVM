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
   * Resolves a user-facing OS template name to the proper simplestreams registry and alias
   */
  public static resolveImageConfig(ostemplate: string): { serverUrl: string; alias: string } {
    let serverUrl = 'https://images.lxd.canonical.com';
    let alias = 'ubuntu/22.04/amd64';

    const template = (ostemplate || 'ubuntu/22.04').toLowerCase();

    if (template.includes('ubuntu')) {
      serverUrl = 'https://cloud-images.ubuntu.com/releases';
      let version = '22.04';
      if (template.includes('20.04') || template.includes('focal')) {
        version = '20.04';
      } else if (template.includes('24.04') || template.includes('noble')) {
        version = '24.04';
      }
      alias = `${version}/amd64`;
    } else if (template.includes('debian')) {
      let ver = '12';
      if (template.includes('11') || template.includes('bullseye')) {
        ver = '11';
      }
      alias = `debian/${ver}/amd64`;
    } else if (template.includes('alpine')) {
      alias = 'alpine/3.21/amd64';
    } else if (template.includes('centos')) {
      alias = 'centos/9-Stream/amd64';
    } else if (template.includes('rocky')) {
      alias = 'rockylinux/9/amd64';
    } else if (template.includes('fedora')) {
      alias = 'fedora/40/amd64';
    } else {
      alias = ostemplate.replace('images:', '');
      if (!alias.includes('/amd64') && !alias.includes('/arm64') && !alias.includes('/i386')) {
        alias = `${alias}/amd64`;
      }
    }

    return { serverUrl, alias };
  }

  /**
   * Pulls/Downloads a remote OS image alias into the local cache if missing
   */
  public static async downloadImage(nodeId: string | null, ostemplate: string): Promise<void> {
    const { serverUrl, alias } = this.resolveImageConfig(ostemplate);

    await LxdClient.request(nodeId, '/1.0/images', 'POST', {
      source: {
        type: 'image',
        mode: 'pull',
        server: serverUrl,
        protocol: 'simplestreams',
        alias: alias
      },
      public: false
    });
  }
}
