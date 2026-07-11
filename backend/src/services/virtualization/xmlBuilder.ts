export class XmlBuilder {
  /**
   * Generates a fully detailed Libvirt Domain XML for KVM/QEMU virtual machines.
   */
  public static build(instance: any, vmConfig: any, disks: any[], nics: any[], pciDevices: any[], cloudInitData?: any): string {
    const vmid = instance.vmid;
    const name = `cynex-${vmid}`;
    const uuid = vmConfig?.smbiosUuid || instance.id || require('crypto').randomUUID();
    const memoryKb = instance.memoryMb * 1024;
    const cores = vmConfig?.cpuCores || instance.cpuCores || 1;
    const threads = vmConfig?.cpuThreads || 1;
    const sockets = vmConfig?.cpuSockets || 1;
    const totalVCpus = cores * threads * sockets;

    // Boot Loader (BIOS vs UEFI)
    let loaderXml = '';
    if (vmConfig?.uefi) {
      loaderXml = `
    <loader readonly='yes' type='pflash'>/usr/share/OVMF/OVMF_CODE.fd</loader>
    <nvram>/var/lib/libvirt/qemu/nvram/${name}_VARS.fd</nvram>
      `;
    }

    // CPU Flags and nested virtualization
    let cpuXml = '';
    const cpuMode = vmConfig?.cpuMode || 'host-passthrough';
    if (cpuMode === 'host-passthrough') {
      cpuXml = `<cpu mode='host-passthrough' check='none'>`;
    } else if (cpuMode === 'host-model') {
      cpuXml = `<cpu mode='host-model'>`;
    } else if (cpuMode === 'custom' && vmConfig?.customCpuModelId) {
      cpuXml = `<cpu mode='custom' match='exact'>
    <model fallback='allow'>${vmConfig.customCpuModelId}</model>`;
    } else {
      cpuXml = `<cpu mode='custom' match='exact'>
    <model fallback='allow'>qemu64</model>`;
    }

    // Add CPU Topology
    cpuXml += `
    <topology sockets='${sockets}' dies='1' cores='${cores}' threads='${threads}'/>
    `;

    // Nested virtualization flags
    if (vmConfig?.nestedVirtualization) {
      cpuXml += `
    <feature policy='require' name='vmx'/>
    <feature policy='require' name='svm'/>
      `;
    }
    if (vmConfig?.hideHypervisor) {
      cpuXml += `
    <feature policy='disable' name='hypervisor'/>
      `;
    }
    cpuXml += `</cpu>`;

    // SMBIOS Customization
    let sysinfoXml = '';
    if (vmConfig) {
      const mfg = vmConfig.smbiosManufacturer || 'CynexVM';
      const prod = vmConfig.smbiosProductName || 'Virtual Server';
      const ver = vmConfig.smbiosVersion || '1.0';
      const serial = vmConfig.smbiosSerialNumber || `cynex-${vmid}`;
      const sku = vmConfig.smbiosSku || 'SKU-001';
      const family = vmConfig.smbiosFamily || 'Compute';

      sysinfoXml = `
  <sysinfo type='smbios'>
    <system>
      <entry name='manufacturer'>${mfg}</entry>
      <entry name='product'>${prod}</entry>
      <entry name='version'>${ver}</entry>
      <entry name='serial'>${serial}</entry>
      <entry name='uuid'>${uuid}</entry>
      <entry name='sku'>${sku}</entry>
      <entry name='family'>${family}</entry>
    </system>
  </sysinfo>
      `;
    }

    // HugePages support
    const memoryBackingXml = vmConfig?.hugePages
      ? `
  <memoryBacking>
    <hugepages/>
  </memoryBacking>
      `
      : '';

    // Disks Configuration
    let disksXml = '';
    disks.forEach((disk: any, index: number) => {
      const diskIndexChar = String.fromCharCode(97 + index); // a, b, c, ...
      const cacheMode = disk.cacheMode || 'none';
      const discard = disk.discard ? "discard='unmap'" : '';
      const ioThreadAttr = disk.ioThreads ? "ioeventfd='on'" : '';

      if (disk.isIso) {
        // CDROM ISO mounting
        const isoPath = disk.isoPath || '/var/lib/libvirt/images/placeholder.iso';
        disksXml += `
    <disk type='file' device='cdrom'>
      <driver name='qemu' type='raw'/>
      <source file='${isoPath}'/>
      <target dev='sd${diskIndexChar}' bus='sata'/>
      <readonly/>
    </disk>
        `;
      } else {
        // HDD disk mount (VirtIO / SATA / SCSI / IDE / NVMe)
        const diskType = disk.type || 'virtio';
        let targetDev = '';
        let bus = 'virtio';

        if (diskType === 'sata') {
          targetDev = `sd${diskIndexChar}`;
          bus = 'sata';
        } else if (diskType === 'scsi') {
          targetDev = `sd${diskIndexChar}`;
          bus = 'scsi';
        } else if (diskType === 'ide') {
          targetDev = `hd${diskIndexChar}`;
          bus = 'ide';
        } else {
          targetDev = `vd${diskIndexChar}`;
          bus = 'virtio';
        }

        const diskPath = `/var/lib/libvirt/images/${name}_${disk.name || 'disk0'}.qcow2`;

        disksXml += `
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2' cache='${cacheMode}' ${discard} ${ioThreadAttr}/>
      <source file='${diskPath}'/>
      <target dev='${targetDev}' bus='${bus}'/>
    </disk>
        `;
      }
    });

    // Networking Interfaces
    let interfacesXml = '';
    nics.forEach((nic: any, index: number) => {
      const bridge = nic.bridge || 'lxdbr0';
      const mac = nic.macAddress || `52:54:00:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(Math.random() * 89 + 10)}:${Math.floor(Math.random() * 89 + 10)}`;
      const model = nic.nicModel || 'virtio';

      // Bandwidth limits average in KB/sec (1 Mbps = 125 KB/s)
      let bandwidthXml = '';
      if (nic.bandwidthLimitIn || nic.bandwidthLimitOut) {
        bandwidthXml = `
      <bandwidth>
        ${nic.bandwidthLimitIn ? `<inbound average='${nic.bandwidthLimitIn * 125}'/>` : ''}
        ${nic.bandwidthLimitOut ? `<outbound average='${nic.bandwidthLimitOut * 125}'/>` : ''}
      </bandwidth>
        `;
      }

      interfacesXml += `
    <interface type='bridge'>
      <mac address='${mac}'/>
      <source bridge='${bridge}'/>
      <model type='${model}'/>
      ${bandwidthXml}
    </interface>
      `;
    });

    // PCI / USB / GPU passthroughs
    let hostdevsXml = '';
    pciDevices.forEach((dev: any) => {
      const addrParts = dev.hostAddress.split(':'); // e.g. "0000:01:00.0" -> ["0000", "01", "00.0"]
      if (addrParts.length >= 3) {
        const domain = addrParts[0];
        const bus = addrParts[1];
        const [slot, func] = addrParts[2].split('.');

        hostdevsXml += `
    <hostdev mode='subsystem' type='pci' managed='yes'>
      <source>
        <address domain='0x${domain}' bus='0x${bus}' slot='0x${slot}' function='0x${func}'/>
      </source>
    </hostdev>
        `;
      }
    });

    // Graphics (VNC / SPICE) and Serial consoles
    const vncPort = 5900 + (vmid % 100);
    const graphicsType = vmConfig?.graphicsType || 'vnc';
    let graphicsXml = '';

    if (graphicsType === 'spice') {
      graphicsXml = `
    <graphics type='spice' autoport='yes'>
      <listen type='address' address='0.0.0.0'/>
      <image compression='off'/>
      <gl enable='no'/>
    </graphics>
      `;
    } else {
      graphicsXml = `
    <graphics type='vnc' port='${vncPort}' autoport='no' listen='0.0.0.0'>
      <listen type='address' address='0.0.0.0'/>
    </graphics>
      `;
    }

    // TPM 2.0 Emulator Support
    const tpmXml = vmConfig?.tpm
      ? `
    <tpm model='tpm-tis'>
      <backend type='emulator' version='2.0'/>
    </tpm>
      `
      : '';

    // Watchdog
    const watchdogXml = vmConfig?.watchdog
      ? `
    <watchdog model='i6300esb' action='${vmConfig.watchdog}'/>
      `
      : '';

    // QEMU Guest Agent channel configuration
    const guestAgentXml = vmConfig?.guestAgent
      ? `
    <channel type='unix'>
      <target type='virtio' name='org.qemu.guest_agent.0'/>
    </channel>
      `
      : '';

    return `
<domain type='kvm'>
  <name>${name}</name>
  <uuid>${uuid}</uuid>
  <memory unit='KiB'>${memoryKb}</memory>
  <currentMemory unit='KiB'>${memoryKb}</currentMemory>
  <vcpu placement='static'>${totalVCpus}</vcpu>
  ${memoryBackingXml}
  <os>
    <type arch='x86_64' machine='${vmConfig?.machineType || 'q35'}'>hvm</type>
    ${loaderXml}
    <boot dev='hd'/>
    <boot dev='cdrom'/>
  </os>
  ${sysinfoXml}
  <features>
    <acpi/>
    <apic/>
    <pae/>
    <vmport state='off'/>
  </features>
  ${cpuXml}
  <clock offset='utc'>
    <timer name='rtc' tickpolicy='catchup'/>
    <timer name='pit' tickpolicy='delay'/>
    <timer name='hpet' present='no'/>
  </clock>
  <on_poweroff>destroy</on_poweroff>
  <on_reboot>restart</on_reboot>
  <on_crash>destroy</on_crash>
  <devices>
    <emulator>/usr/bin/qemu-system-x86_64</emulator>
    ${disksXml}
    ${interfacesXml}
    ${hostdevsXml}
    ${graphicsXml}
    ${tpmXml}
    ${watchdogXml}
    ${guestAgentXml}
    <serial type='pty'>
      <target port='0'/>
    </serial>
    <console type='pty'>
      <target type='serial' port='0'/>
    </console>
    <video>
      <model type='${vmConfig?.gpuType || 'vga'}' vram='16384' heads='1' primary='yes'/>
    </video>
    <rng model='virtio'>
      <backend model='random'>/dev/urandom</backend>
    </rng>
  </devices>
</domain>
    `.trim();
  }
}
