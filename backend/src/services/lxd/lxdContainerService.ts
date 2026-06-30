import { LxdClient } from './lxdClient';

import { ProvisioningEngine } from '../provisioningEngine';

export interface ContainerConfig {
  vmid: number;
  ostemplate: string;
  hostname: string;
  cores: number;
  memory: number; // in MB
  diskSizeGb: number;
  password?: string;
  sshKeys?: string[];
  timezone?: string;
  locale?: string;
}

export class LxdContainerService {
  /**
   * Lists all containers on the specified node
   */
  public static async list(nodeId: string | null): Promise<any[]> {
    try {
      const data = await LxdClient.request(nodeId, '/1.0/instances', 'GET');
      const names = data.map((url: string) => url.split('/').pop());
      
      const details = await Promise.all(
        names.map(async (name: string) => {
          try {
            const info = await LxdClient.request(nodeId, `/1.0/instances/${name}`, 'GET');
            const state = await LxdClient.request(nodeId, `/1.0/instances/${name}/state`, 'GET');
            return {
              name,
              status: state.status?.toLowerCase() || 'stopped',
              config: info.config || {},
              devices: info.devices || {},
              state
            };
          } catch (_) {
            return null;
          }
        })
      );
      return details.filter(d => d !== null);
    } catch (err: any) {
      console.error(`[LxdContainerService.list] Failed:`, err.message);
      return [];
    }
  }

  /**
   * Retrieves live details of a specific container
   */
  public static async getInfo(nodeId: string | null, vmid: number): Promise<any> {
    const name = `cynex-${vmid}`;
    const info = await LxdClient.request(nodeId, `/1.0/instances/${name}`, 'GET');
    const state = await LxdClient.request(nodeId, `/1.0/instances/${name}/state`, 'GET');
    
    const cpuLimit = info.config?.['limits.cpu'] ? parseInt(info.config['limits.cpu'], 10) : 1;
    const ramLimitRaw = info.config?.['limits.memory'] || '512MB';
    const ramLimit = parseInt(ramLimitRaw.replace(/[^0-9]/g, ''), 10);

    const rootDevice = info.devices?.root || {};
    const diskLimitRaw = rootDevice.size || '10GiB';
    const diskLimit = parseInt(diskLimitRaw.replace(/[^0-9]/g, ''), 10);

    return {
      status: state.status?.toLowerCase() || 'stopped',
      cpuCores: cpuLimit,
      memoryMb: ramLimit,
      storageGb: diskLimit,
      live: {
        status: state.status?.toLowerCase() || 'stopped',
        cpu: (state.cpu?.usage || 0) / 1e9,
        maxcpu: cpuLimit,
        mem: state.memory?.usage || 0,
        maxmem: state.memory?.usage_peak || ramLimit * 1024 * 1024,
        disk: state.disk?.root?.usage || 0,
        maxdisk: diskLimit * 1024 * 1024 * 1024,
        netin: Object.values(state.network || {}).reduce((acc: number, iface: any) => acc + (iface.counters?.bytes_received || 0), 0),
        netout: Object.values(state.network || {}).reduce((acc: number, iface: any) => acc + (iface.counters?.bytes_sent || 0), 0),
        uptime: state.uptime || 0
      }
    };
  }

  /**
   * Triggers a state modification (start / stop / restart / freeze / unfreeze)
   */
  public static async setStatus(nodeId: string | null, vmid: number, action: 'start' | 'stop' | 'restart' | 'freeze' | 'unfreeze', force = false): Promise<void> {
    const name = `cynex-${vmid}`;
    await LxdClient.request(nodeId, `/1.0/instances/${name}/state`, 'PUT', {
      action,
      timeout: 30,
      force
    });
  }

  /**
   * Initializes and deploys a new LXC container
   */
  public static async create(nodeId: string | null, config: ContainerConfig): Promise<void> {
    const name = `cynex-${config.vmid}`;
    
    // Resolve image alias with architecture suffix for simplestreams
    let alias = 'ubuntu/22.04';
    if (config.ostemplate) {
      if (config.ostemplate.toLowerCase().includes('debian')) {
        alias = 'debian/12';
      } else if (config.ostemplate.toLowerCase().includes('alpine')) {
        alias = 'alpine/3.19';
      } else if (config.ostemplate.toLowerCase().includes('centos')) {
        alias = 'centos/9-Stream';
      } else if (config.ostemplate.toLowerCase().includes('rocky')) {
        alias = 'rockylinux/9';
      } else if (config.ostemplate.toLowerCase().includes('fedora')) {
        alias = 'fedora/40';
      } else if (config.ostemplate.includes('/')) {
        alias = config.ostemplate.replace('images:', '');
      }
    }

    // Append architecture if not already present
    if (!alias.includes('/amd64') && !alias.includes('/arm64') && !alias.includes('/i386')) {
      alias = `${alias}/amd64`;
    }

    // All LXC images live on the official Canonical LXD server
    const serverUrl = 'https://images.lxd.canonical.com';

    // Get active storage pool
    const { LxdStorageService } = require('../lxd/lxdStorageService');
    const pools = await LxdStorageService.list(nodeId);
    const activePool = pools.find((p: any) => p.name === 'default') || pools[0];
    const poolName = activePool ? activePool.name : 'default';

    const userData = ProvisioningEngine.generateCloudConfig({
      hostname: config.hostname,
      password: config.password,
      sshKeys: config.sshKeys,
      timezone: config.timezone,
      locale: config.locale
    });

    // Create container with image pull + config + devices in a single call
    await LxdClient.request(nodeId, '/1.0/instances', 'POST', {
      name,
      source: {
        type: 'image',
        mode: 'pull',
        server: serverUrl,
        protocol: 'simplestreams',
        alias: alias
      },
      config: {
        'limits.cpu': String(config.cores),
        'limits.memory': `${config.memory}MB`,
        'user.user-data': userData
      },
      devices: {
        root: {
          path: '/',
          pool: poolName,
          type: 'disk',
          size: `${config.diskSizeGb}GiB`
        }
      },
      profiles: ['default']
    });

    // 3. Start container
    await this.setStatus(nodeId, config.vmid, 'start');
  }

  /**
   * Destroys the container
   */
  public static async delete(nodeId: string | null, vmid: number): Promise<void> {
    const name = `cynex-${vmid}`;
    // Force stop first if running
    try {
      await this.setStatus(nodeId, vmid, 'stop', true);
    } catch (_) {}

    await LxdClient.request(nodeId, `/1.0/instances/${name}`, 'DELETE');
  }
}
