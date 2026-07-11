import { KVMProvider } from './kvmProvider';

export class QEMUProvider extends KVMProvider {
  // Inherits all VM creation, disk resize, guest file agents, metrics, and power state controls
  // from KVMProvider, as libvirt orchestrates both under the QEMU driver stack.
}
