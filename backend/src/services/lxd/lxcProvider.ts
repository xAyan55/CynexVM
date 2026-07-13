import { NodeClient } from './nodeClient';
import { ProvisioningEngine } from '../provisioningEngine';
import { LxdFileService } from './lxdFileService';

export class LXCProvider {
  private getContainerName(vmid: number): string {
    return `cynex-${vmid}`;
  }

  public async create(node: any, instance: any, data: any): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    const pools = await NodeClient.requestLxd(node.id, '/1.0/storage-pools', 'GET');
    const poolNames = pools.map((url: string) => url.split('/').pop());
    const poolName = poolNames.includes('default') ? 'default' : poolNames[0] || 'default';
    const ostemplate = data.osTemplate || instance.osTemplate;
    const { LxdImageService } = require('./lxdImageService');
    const { serverUrl, alias } = LxdImageService.resolveImageConfig(ostemplate);
    const userData = ProvisioningEngine.generateCloudConfig({
      hostname: data.hostname || instance.hostname,
      password: data.password || instance.password,
      sshKeys: data.sshKeys || [],
      timezone: data.timezone,
      locale: data.locale,
    });
    await NodeClient.requestLxd(node.id, '/1.0/instances', 'POST', {
      name: containerName,
      source: {
        type: 'image',
        mode: 'pull',
        server: serverUrl,
        protocol: 'simplestreams',
        alias: alias,
      },
      config: {
        'limits.cpu': String(data.cpuCores || instance.cpuCores),
        'limits.memory': `${data.memoryMb || instance.memoryMb}MB`,
        'user.user-data': userData,
      },
      devices: {
        root: {
          path: '/',
          pool: poolName,
          type: 'disk',
          size: `${data.storageGb || instance.storageGb}GiB`,
        },
      },
      profiles: ['default'],
    });
    await this.start(node, instance);
  }

  public async delete(node: any, instance: any): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    try {
      await this.stop(node, instance, true);
    } catch (_) {}
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}`, 'DELETE');
  }

  public async start(node: any, instance: any): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/state`, 'PUT', {
      action: 'start',
      timeout: 30,
    });
  }

  public async stop(node: any, instance: any, force = false): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/state`, 'PUT', {
      action: 'stop',
      timeout: 30,
      force,
    });
  }

  public async restart(node: any, instance: any): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/state`, 'PUT', {
      action: 'restart',
      timeout: 30,
    });
  }

  public async kill(node: any, instance: any): Promise<void> {
    await this.stop(node, instance, true);
  }

  public async pause(node: any, instance: any): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/state`, 'PUT', {
      action: 'freeze',
      timeout: 30,
    });
  }

  public async resume(node: any, instance: any): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/state`, 'PUT', {
      action: 'unfreeze',
      timeout: 30,
    });
  }

  public async reinstall(node: any, instance: any, data: any): Promise<void> {
    await this.delete(node, instance);
    await this.create(node, instance, data);
  }

  public async snapshot(node: any, instance: any, name: string, description?: string): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/snapshots`, 'POST', {
      name,
      stateful: false,
    });
  }

  public async restore(node: any, instance: any, name: string): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}`, 'PUT', {
      restore: name,
    });
  }

  public async listSnapshots(node: any, instance: any): Promise<any[]> {
    const containerName = this.getContainerName(instance.vmid);
    try {
      const data = await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/snapshots`, 'GET');
      return data.map((url: string) => {
        const name = url.split('/').pop() || '';
        return { name, description: 'LXC Snapshot Checkpoint', createdAt: new Date() };
      });
    } catch (_) {
      return [];
    }
  }

  public async deleteSnapshot(node: any, instance: any, name: string): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/snapshots/${name}`, 'DELETE');
  }

  public async clone(node: any, instance: any, newVmid: number, newName: string): Promise<void> {
    const sourceName = this.getContainerName(instance.vmid);
    const targetName = this.getContainerName(newVmid);
    await NodeClient.requestLxd(node.id, '/1.0/instances', 'POST', {
      name: targetName,
      source: {
        type: 'copy',
        source: sourceName,
      },
    });
  }

  public async rename(node: any, instance: any, newName: string): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}`, 'POST', {
      name: newName,
    });
  }

  public async resizeDisk(node: any, instance: any, diskName: string, sizeGb: number): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}`, 'PATCH', {
      devices: {
        root: {
          path: '/',
          pool: 'default',
          type: 'disk',
          size: `${sizeGb}GiB`,
        },
      },
    });
  }

  public async resizeMemory(node: any, instance: any, memoryMb: number): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}`, 'PATCH', {
      config: {
        'limits.memory': `${memoryMb}MB`,
      },
    });
  }

  public async resizeCPU(node: any, instance: any, cores: number): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}`, 'PATCH', {
      config: {
        'limits.cpu': String(cores),
      },
    });
  }

  public async attachNetwork(node: any, instance: any, network: any): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}`, 'PATCH', {
      devices: {
        [network.name || 'eth1']: {
          name: network.name || 'eth1',
          nictype: 'bridged',
          parent: network.bridge || 'lxdbr0',
          type: 'nic',
          'ipv4.address': network.ipv4Address !== 'dhcp' ? network.ipv4Address : undefined,
        },
      },
    });
  }

  public async detachNetwork(node: any, instance: any, nicId: string): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    const info = await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}`, 'GET');
    const devices = info.devices || {};
    delete devices[nicId];
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}`, 'PUT', {
      devices,
    });
  }

  public async createBackup(node: any, instance: any, backupName: string, storageProvider: any): Promise<any> {
    const containerName = this.getContainerName(instance.vmid);
    const backup = await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/backups`, 'POST', {
      name: backupName,
      compression_algorithm: 'gzip',
      instance_only: true,
    });
    return backup;
  }

  public async restoreBackup(node: any, instance: any, backupId: string, storageProvider: any): Promise<void> {
    const containerName = this.getContainerName(instance.vmid);
    await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/backups/${backupId}/restore`, 'POST');
  }

  public async metrics(node: any, instance: any): Promise<any> {
    const containerName = this.getContainerName(instance.vmid);
    try {
      const state = await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/state`, 'GET');
      const info = await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}`, 'GET');
      const cpuLimit = info.config?.['limits.cpu'] ? parseInt(info.config['limits.cpu'], 10) : 1;
      const ramLimitRaw = info.config?.['limits.memory'] || '512MB';
      const ramLimit = parseInt(ramLimitRaw.replace(/[^0-9]/g, ''), 10);
      const diskLimit = instance.storageGb;
      return {
        cpu: (state.cpu?.usage || 0) / 1e9,
        maxcpu: cpuLimit,
        mem: state.memory?.usage || 0,
        maxmem: state.memory?.usage_peak || ramLimit * 1024 * 1024,
        disk: state.disk?.root?.usage || 0,
        maxdisk: diskLimit * 1024 * 1024 * 1024,
        netin: Object.values(state.network || {}).reduce((acc: number, iface: any) => acc + (iface.counters?.bytes_received || 0), 0),
        netout: Object.values(state.network || {}).reduce((acc: number, iface: any) => acc + (iface.counters?.bytes_sent || 0), 0),
        uptime: state.uptime || 0,
        status: state.status?.toLowerCase() || 'stopped',
        load: [0.1, 0.05, 0.02],
        processes: 15,
      };
    } catch (_) {
      return {
        cpu: 0,
        maxcpu: instance.cpuCores,
        mem: 0,
        maxmem: instance.memoryMb * 1024 * 1024,
        disk: 0,
        maxdisk: instance.storageGb * 1024 * 1024 * 1024,
        netin: 0,
        netout: 0,
        uptime: 0,
        status: 'stopped',
        load: [0, 0, 0],
        processes: 0,
      };
    }
  }

  public async files(node: any, instance: any, action: string, path: string, data?: any): Promise<any> {
    switch (action) {
      case 'list':
        return LxdFileService.listDirectory(node.id, instance.vmid, path);
      case 'read':
        return LxdFileService.readFile(node.id, instance.vmid, path);
      case 'write':
        return LxdFileService.writeFile(node.id, instance.vmid, path, data.content);
      case 'delete':
        return LxdFileService.deleteFile(node.id, instance.vmid, path);
      default:
        throw new Error(`Unsupported file action: ${action}`);
    }
  }

  public async powerState(node: any, instance: any): Promise<string> {
    const containerName = this.getContainerName(instance.vmid);
    const state = await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}/state`, 'GET');
    return state.status?.toLowerCase() || 'stopped';
  }

  public async information(node: any, instance: any): Promise<any> {
    const containerName = this.getContainerName(instance.vmid);
    const info = await NodeClient.requestLxd(node.id, `/1.0/instances/${containerName}`, 'GET');
    return info;
  }

  public async statistics(node: any, instance: any): Promise<any> {
    return this.metrics(node, instance);
  }
}

export const lxcProvider = new LXCProvider();
