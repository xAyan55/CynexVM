export interface VirtualizationProvider {
  create(node: any, instance: any, data: any): Promise<void>;
  delete(node: any, instance: any): Promise<void>;
  start(node: any, instance: any): Promise<void>;
  stop(node: any, instance: any, force?: boolean): Promise<void>;
  restart(node: any, instance: any): Promise<void>;
  kill(node: any, instance: any): Promise<void>;
  pause(node: any, instance: any): Promise<void>;
  resume(node: any, instance: any): Promise<void>;
  reinstall(node: any, instance: any, data: any): Promise<void>;
  snapshot(node: any, instance: any, name: string, description?: string): Promise<void>;
  restore(node: any, instance: any, name: string): Promise<void>;
  listSnapshots(node: any, instance: any): Promise<any[]>;
  deleteSnapshot(node: any, instance: any, name: string): Promise<void>;
  clone(node: any, instance: any, newVmid: number, newName: string): Promise<void>;
  rename(node: any, instance: any, newName: string): Promise<void>;
  resizeDisk(node: any, instance: any, diskName: string, sizeGb: number): Promise<void>;
  resizeMemory(node: any, instance: any, memoryMb: number): Promise<void>;
  resizeCPU(node: any, instance: any, cores: number): Promise<void>;
  attachISO(node: any, instance: any, isoPath: string): Promise<void>;
  detachISO(node: any, instance: any): Promise<void>;
  attachNetwork(node: any, instance: any, network: any): Promise<void>;
  detachNetwork(node: any, instance: any, nicId: string): Promise<void>;
  createBackup(node: any, instance: any, backupName: string, storageProvider: any): Promise<any>;
  restoreBackup(node: any, instance: any, backupId: string, storageProvider: any): Promise<void>;
  console(node: any, instance: any, socket: any, token: string): Promise<any>;
  metrics(node: any, instance: any): Promise<any>;
  files(node: any, instance: any, action: string, path: string, data?: any): Promise<any>;
  terminal(node: any, instance: any, socket: any, cols: number, rows: number, token: string): Promise<any>;
  powerState(node: any, instance: any): Promise<string>;
  information(node: any, instance: any): Promise<any>;
  statistics(node: any, instance: any): Promise<any>;
  healthCheck?(node: any, instance: any): Promise<any>;
  repairConsole?(node: any, instance: any): Promise<void>;
}

import { LXCProvider } from './lxcProvider';
import { QEMUProvider } from './qemuProvider';
import { KVMProvider } from './kvmProvider';

export class VirtualizationProviderFactory {
  public static getProvider(type: string): VirtualizationProvider {
    switch (type?.toUpperCase()) {
      case 'LXC':
        return new LXCProvider();
      case 'QEMU':
        return new QEMUProvider();
      case 'KVM':
        return new KVMProvider();
      default:
        throw new Error(`Unsupported hypervisor type: ${type}`);
    }
  }
}
