import { VirtualizationProvider } from './provider';
import { NodeClient } from './nodeClient';
import { XmlBuilder } from './xmlBuilder';
import { FirmwareDetector } from './firmwareDetector';
import { GuestProfileService, GuestProfile } from './guestProfileService';
import { ConsoleService } from './consoleService';

export class KVMProvider implements VirtualizationProvider {
  private getDomainName(vmid: number): string {
    return `cynex-${vmid}`;
  }

  public async create(node: any, instance: any, data: any): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const vmid = instance.vmid;
    const storageGb = data.storageGb || instance.storageGb || 10;
    const memoryMb = data.memoryMb || instance.memoryMb || 512;
    const cpuCores = data.cpuCores || instance.cpuCores || 1;

    // Validate firmware before proceeding
    const vmConfig = data.vmConfig || {};
    const autoFallback = vmConfig.autoFallback !== false;
    const firmware = await FirmwareDetector.validateFirmware(node.id, !!vmConfig.uefi, autoFallback);
    if (firmware.firmwareType === 'uefi') {
      vmConfig.firmware = {
        codePath: firmware.codePath,
        varsPath: firmware.varsPath,
        nvramPath: `/var/lib/libvirt/qemu/nvram/${domainName}_VARS.fd`,
      };
    }


    // 1. Create storage directories and blank QCOW2 disk
    await NodeClient.executeCommand(node.id, `mkdir -p /var/lib/libvirt/images/templates`);
    const diskPath = `/var/lib/libvirt/images/${domainName}_disk0.qcow2`;
    
    let templateName = 'ubuntu-22-04';
    if (data.osTemplate) {
      if (data.osTemplate.includes(':')) {
        templateName = (data.osTemplate.split(':').pop() || 'ubuntu-22-04').replace(/\//g, '-');
      } else {
        templateName = data.osTemplate.replace(/\//g, '-');
      }
    }

    const guestProfile = GuestProfileService.resolveProfile(templateName);
    const isLinux = guestProfile.guestType === 'Linux';

    // If template / cloud image is specified, copy it as base, else create empty qcow2
    if (data.osTemplate && data.osTemplate.includes(':')) {
      const templatePath = `/var/lib/libvirt/images/templates/${templateName}.qcow2`;
      
      // Ensure template directory exists
      await NodeClient.executeCommand(node.id, `mkdir -p /var/lib/libvirt/images/templates`);
      
      // Auto download if template doesn't exist on host
      const checkTemplate = await NodeClient.executeCommand(node.id, `ls ${templatePath} 2>/dev/null`);
      if (checkTemplate.exitCode !== 0) {
        let downloadUrl = `https://cloud-images.ubuntu.com/minimal/releases/jammy/release/ubuntu-22.04-minimal-cloudimg-amd64.img`;
        if (templateName?.includes('debian')) {
          downloadUrl = `https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2`;
        } else if (templateName?.includes('alpine')) {
          downloadUrl = `https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/alpine-virt-3.19.0-x86_64.iso`;
        } else if (templateName?.includes('centos')) {
          downloadUrl = `https://cloud.centos.org/centos/9-stream/x86_64/images/CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2`;
        } else if (templateName?.includes('rocky')) {
          downloadUrl = `https://dl.rockylinux.org/pub/rocky/9/images/x86_64/Rocky-9-GenericCloud.latest.x86_64.qcow2`;
        } else if (templateName?.includes('alma')) {
          downloadUrl = `https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2`;
        }
        const dl = await NodeClient.executeCommand(node.id, `curl -sSL -o ${templatePath} ${downloadUrl}`);
        if (dl.exitCode !== 0) {
          throw new Error(`Failed to download cloud image: ${dl.stderr}`);
        }
      }
      
      // Copy template to primary disk
      const cpRes = await NodeClient.executeCommand(node.id, `cp ${templatePath} ${diskPath}`);
      if (cpRes.exitCode !== 0) {
        throw new Error(`Failed to copy template: ${cpRes.stderr}`);
      }
      await NodeClient.executeCommand(node.id, `qemu-img resize ${diskPath} ${storageGb}G`);
    } else {
      // Create empty disk
      await NodeClient.executeCommand(node.id, `qemu-img create -f qcow2 ${diskPath} ${storageGb}G`);
    }

    // 2. Generate Cloud-init ISO or run Offline Customization (Never both)
    let disks = [{ name: 'disk0', sizeGb: storageGb, isIso: false, type: 'virtio' }];
    const useCloudInit = !!(data.cloudInit?.enabled || instance.cloudInit?.enabled);

    if (useCloudInit) {
      let userData = data.cloudInit?.userData || '';
      const metaData = data.cloudInit?.metaData || `instance-id: ${instance.id}\nlocal-hostname: ${data.hostname || instance.hostname}`;
      
      if (isLinux) {
        userData = modifyCloudInit(userData, guestProfile.distribution.toLowerCase());
      }

      const userDataPath = `/tmp/${domainName}_user-data`;
      const metaDataPath = `/tmp/${domainName}_meta-data`;
      const cloudInitIsoPath = `/var/lib/libvirt/images/${domainName}_cloudinit.iso`;

      // Write files on node using command injection redirection
      await NodeClient.executeCommand(node.id, `echo "${Buffer.from(userData).toString('base64')}" | base64 -d > ${userDataPath}`);
      await NodeClient.executeCommand(node.id, `echo "${Buffer.from(metaData).toString('base64')}" | base64 -d > ${metaDataPath}`);
      
      // Run genisoimage or cloud-localds
      await NodeClient.executeCommand(
        node.id,
        `genisoimage -output ${cloudInitIsoPath} -volid cidata -joliet -rock ${userDataPath} ${metaDataPath}`
      );
      
      // Add cloud-init as ISO CDROM
      disks.push({ name: 'cloudinit', sizeGb: 0, isIso: true, type: 'sata', isoPath: cloudInitIsoPath } as any);
    } else if (isLinux) {
      // Cloud-init is disabled: run offline customization if virt-customize is available
      const checkVirt = await NodeClient.executeCommand(node.id, "command -v virt-customize && echo yes || echo no");
      if (checkVirt.stdout.includes('yes')) {
        const dist = guestProfile.distribution.toLowerCase();
        let grubLinePattern = 'GRUB_CMDLINE_LINUX_DEFAULT';
        let grubUpdateCmd = 'update-grub';
        if (['centos', 'rocky', 'alma'].includes(dist)) {
          grubLinePattern = 'GRUB_CMDLINE_LINUX';
          grubUpdateCmd = 'grub2-mkconfig -o /boot/grub2/grub.cfg';
        }

        const scriptContent = `
#!/bin/bash
echo -e "nameserver 8.8.8.8\\nnameserver 1.1.1.1" > /etc/resolv.conf
if [ -f /etc/systemd/resolved.conf ]; then
  sed -i "s/#DNS=/DNS=8.8.8.8 1.1.1.1/g" /etc/systemd/resolved.conf
  sed -i "s/DNS=.*/DNS=8.8.8.8 1.1.1.1/g" /etc/systemd/resolved.conf
  systemctl restart systemd-resolved || true
fi
if [ -f /etc/default/grub ]; then
  if ! grep -q "console=ttyS0" /etc/default/grub; then
    sed -i 's/\\(${grubLinePattern}=".*\\)"/\\1 console=tty0 console=ttyS0,115200n8"/' /etc/default/grub
  fi
fi
if command -v ${grubUpdateCmd} >/dev/null 2>&1; then
  ${grubUpdateCmd}
fi
if command -v grubby >/dev/null 2>&1; then
  grubby --update-kernel=ALL --args="console=tty0 console=ttyS0,115200n8" || true
fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable serial-getty@ttyS0.service || true
fi
`.trim();

        const scriptB64 = Buffer.from(scriptContent).toString('base64');
        const tempScriptPath = `/tmp/${domainName}_guest_custom.sh`;
        
        await NodeClient.executeCommand(node.id, `echo "${scriptB64}" | base64 -d > ${tempScriptPath} && chmod +x ${tempScriptPath}`);
        await NodeClient.executeCommand(node.id, `virt-customize -a ${diskPath} --run ${tempScriptPath}`, 180000);
        await NodeClient.executeCommand(node.id, `rm -f ${tempScriptPath}`);
      }
    }

    // 3. Compile Domain XML
    const xml = XmlBuilder.build(
      { vmid, name: instance.name, id: instance.id, cpuCores, memoryMb, storageGb },
      vmConfig,
      disks,
      data.networkInterfaces || [{ bridge: 'lxdbr0', macAddress: '52:54:00:12:34:56', nicModel: 'virtio' }],
      data.pciDevices || []
    );

    const xmlPath = `/tmp/${domainName}.xml`;
    // Write XML file on node
    await NodeClient.executeCommand(node.id, `echo "${Buffer.from(xml).toString('base64')}" | base64 -d > ${xmlPath}`);

    // 4. Define and start the VM
    const defineRes = await NodeClient.executeCommand(node.id, `virsh define ${xmlPath}`);
    if (defineRes.exitCode !== 0) {
      throw new Error(`Failed to define VM XML: ${defineRes.stderr}`);
    }

    const startRes = await NodeClient.executeCommand(node.id, `virsh start ${domainName}`);
    if (startRes.exitCode !== 0) {
      // Rollback on define
      await NodeClient.executeCommand(node.id, `virsh undefine ${domainName}`);
      throw new Error(`Failed to boot VM: ${startRes.stderr}`);
    }

    // Wait for Guest Agent connection (if guestAgent is true)
    if (vmConfig?.guestAgent) {
      for (let i = 0; i < 15; i++) {
        const pingAgent = await NodeClient.executeCommand(
          node.id,
          `virsh qemu-agent-command ${domainName} '{"execute":"guest-ping"}'`
        );
        if (pingAgent.exitCode === 0) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  public async delete(node: any, instance: any): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    await NodeClient.executeCommand(node.id, `virsh destroy ${domainName}`);
    await NodeClient.executeCommand(node.id, `virsh undefine ${domainName} --remove-all-storage`);
    
    // Manually ensure files are cleared
    await NodeClient.executeCommand(node.id, `rm -f /var/lib/libvirt/images/${domainName}_*`);
    await NodeClient.executeCommand(node.id, `rm -f /tmp/${domainName}_*`);
  }

  public async start(node: any, instance: any): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh start ${domainName}`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async stop(node: any, instance: any, force = false): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const action = force ? 'destroy' : 'shutdown';
    const res = await NodeClient.executeCommand(node.id, `virsh ${action} ${domainName}`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async restart(node: any, instance: any): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh reboot ${domainName}`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async kill(node: any, instance: any): Promise<void> {
    await this.stop(node, instance, true);
  }

  public async pause(node: any, instance: any): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh suspend ${domainName}`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async resume(node: any, instance: any): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh resume ${domainName}`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async reinstall(node: any, instance: any, data: any): Promise<void> {
    await this.delete(node, instance);
    await this.create(node, instance, data);
  }

  public async snapshot(node: any, instance: any, name: string, description?: string): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const desc = description ? `--description "${description}"` : '';
    const res = await NodeClient.executeCommand(
      node.id,
      `virsh snapshot-create-as ${domainName} ${name} ${desc} --atomic`
    );
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async restore(node: any, instance: any, name: string): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh snapshot-revert ${domainName} ${name}`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async listSnapshots(node: any, instance: any): Promise<any[]> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh snapshot-list ${domainName} --name`);
    if (res.exitCode !== 0) return [];
    return res.stdout
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0)
      .map(name => ({
        name,
        description: 'VM Snapshot Checkpoint',
        createdAt: new Date()
      }));
  }

  public async deleteSnapshot(node: any, instance: any, name: string): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh snapshot-delete ${domainName} ${name}`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async clone(node: any, instance: any, newVmid: number, newName: string): Promise<void> {
    const sourceName = this.getDomainName(instance.vmid);
    const targetName = this.getDomainName(newVmid);
    const res = await NodeClient.executeCommand(
      node.id,
      `virt-clone --original ${sourceName} --name ${targetName} --auto-clone`
    );
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async rename(node: any, instance: any, newName: string): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh domrename ${domainName} ${newName}`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async resizeDisk(node: any, instance: any, diskName: string, sizeGb: number): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const diskFile = `/var/lib/libvirt/images/${domainName}_${diskName}.qcow2`;
    await NodeClient.executeCommand(node.id, `qemu-img resize ${diskFile} ${sizeGb}G`);
    
    // Live resize if VM is running
    const state = await this.powerState(node, instance);
    if (state === 'running') {
      const diskTarget = diskName === 'disk0' ? 'vda' : diskName === 'disk1' ? 'vdb' : 'vdc';
      await NodeClient.executeCommand(node.id, `virsh blockresize ${domainName} ${diskTarget} ${sizeGb}G`);
    }
  }

  public async resizeMemory(node: any, instance: any, memoryMb: number): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh setmem ${domainName} ${memoryMb}M --config --live`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async resizeCPU(node: any, instance: any, cores: number): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh setvcpus ${domainName} ${cores} --config --live`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async attachISO(node: any, instance: any, isoPath: string): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(
      node.id,
      `virsh attach-disk ${domainName} ${isoPath} hdb --device cdrom --mode readonly --config --live`
    );
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async detachISO(node: any, instance: any): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh detach-disk ${domainName} hdb --config --live`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async attachNetwork(node: any, instance: any, network: any): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(
      node.id,
      `virsh attach-interface ${domainName} bridge ${network.bridge || 'lxdbr0'} --model ${network.nicModel || 'virtio'} --config --live`
    );
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async detachNetwork(node: any, instance: any, nicId: string): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    // detach-interface takes MAC address
    const res = await NodeClient.executeCommand(node.id, `virsh detach-interface ${domainName} bridge --mac ${nicId} --config --live`);
    if (res.exitCode !== 0) throw new Error(res.stderr);
  }

  public async createBackup(node: any, instance: any, backupName: string, storageProvider: any): Promise<any> {
    const domainName = this.getDomainName(instance.vmid);
    const tempBackupPath = `/tmp/${domainName}_backup_${Date.now()}.qcow2`;
    const diskPath = `/var/lib/libvirt/images/${domainName}_disk0.qcow2`;
    
    // Copy disk while running or stopped
    const state = await this.powerState(node, instance);
    if (state === 'running') {
      // Create external snapshot for live backup
      const snapName = `${domainName}_livebackup_snap`;
      await NodeClient.executeCommand(node.id, `virsh snapshot-create-as ${domainName} ${snapName} --no-metadata --disk-only --atomic`);
      // Copy backing file
      await NodeClient.executeCommand(node.id, `cp ${diskPath} ${tempBackupPath}`);
      // Blockcommit back to merge live diffs
      await NodeClient.executeCommand(node.id, `virsh blockcommit ${domainName} vda --active --pivot`);
      // Remove temporary snapshot
      await NodeClient.executeCommand(node.id, `virsh snapshot-delete ${domainName} ${snapName} --metadata`);
    } else {
      await NodeClient.executeCommand(node.id, `cp ${diskPath} ${tempBackupPath}`);
    }

    return { path: tempBackupPath };
  }

  public async restoreBackup(node: any, instance: any, backupId: string, storageProvider: any): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const diskPath = `/var/lib/libvirt/images/${domainName}_disk0.qcow2`;
    await this.stop(node, instance, true).catch(() => {});
    await NodeClient.executeCommand(node.id, `cp ${backupId} ${diskPath}`);
    await this.start(node, instance);
  }

  public async console(node: any, instance: any, socket: any, token: string): Promise<any> {
    // VNC proxy stream is established directly on WebSocket Server upgrade endpoint
  }

  private async checkGuestAgent(nodeId: string, domainName: string): Promise<boolean> {
    try {
      const res = await NodeClient.executeCommand(nodeId, `virsh qemu-agent-command ${domainName} '{"execute":"guest-ping"}' 2>/dev/null`);
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  private resolveBootStatus(
    virshState: string,
    instanceStatus: string,
    agentResponds: boolean | null,
    updatedAt: Date | string | undefined
  ): string {
    if (virshState !== 'running') return virshState;
    if (!['rebooting', 'starting'].includes(instanceStatus)) return virshState;

    // If agent check was performed and it responds, VM is fully booted
    if (agentResponds === true) return 'running';

    // Agent didn't respond (or wasn't checked) — use grace period
    if (updatedAt) {
      const bootTime = new Date(updatedAt).getTime();
      const elapsed = Date.now() - bootTime;
      if (elapsed > 60_000) return 'running';
    }

    return 'starting';
  }

  public async metrics(node: any, instance: any): Promise<any> {
    const domainName = this.getDomainName(instance.vmid);
    try {
      const statsRes = await NodeClient.executeCommand(node.id, `virsh domstats ${domainName}`);
      const infoRes = await NodeClient.executeCommand(node.id, `virsh dominfo ${domainName}`);
      
      const stats = statsRes.stdout;
      const info = infoRes.stdout;

      // Extract metrics via RegEx
      const cpuTimeMatch = stats.match(/cpu\.time=(\d+)/);
      const memUnusedMatch = stats.match(/balloon\.unused=(\d+)/);
      const memTotalMatch = stats.match(/balloon\.maximum=(\d+)/);
      const diskRdBytesMatch = stats.match(/block\.\d+\.rd\.bytes=(\d+)/);
      const diskWrBytesMatch = stats.match(/block\.\d+\.wr\.bytes=(\d+)/);
      const netRxBytesMatch = stats.match(/net\.\d+\.rx\.bytes=(\d+)/);
      const netTxBytesMatch = stats.match(/net\.\d+\.tx\.bytes=(\d+)/);

      const stateMatch = info.match(/State:\s+(.*)/);
      const uptimeMatch = info.match(/CPU time:\s+(\d+)/);

      const virshState = stateMatch ? stateMatch[1].trim().toLowerCase() : 'stopped';

      const memoryTotal = memTotalMatch ? parseInt(memTotalMatch[1], 10) * 1024 : instance.memoryMb * 1024 * 1024;
      const memoryUnused = memUnusedMatch ? parseInt(memUnusedMatch[1], 10) * 1024 : 0;
      const memoryUsed = memoryTotal - memoryUnused;

      // Determine guest boot status and guest agent availability
      let resolvedStatus: string;
      let guestAgentOk = false;
      if (virshState === 'running') {
        guestAgentOk = await this.checkGuestAgent(node.id, domainName);
        if (['rebooting', 'starting'].includes(instance.status)) {
          resolvedStatus = this.resolveBootStatus(virshState, instance.status, guestAgentOk, instance.updatedAt);
        } else {
          resolvedStatus = virshState;
        }
      } else {
        resolvedStatus = virshState;
      }

      return {
        cpu: cpuTimeMatch ? parseFloat(cpuTimeMatch[1]) / 1e9 : 0.05,
        maxcpu: instance.cpuCores,
        mem: memoryUsed,
        maxmem: memoryTotal,
        disk: diskRdBytesMatch ? parseInt(diskRdBytesMatch[1], 10) + parseInt(diskWrBytesMatch?.[1] || '0', 10) : 0,
        maxdisk: instance.storageGb * 1024 * 1024 * 1024,
        netin: netRxBytesMatch ? parseInt(netRxBytesMatch[1], 10) : 0,
        netout: netTxBytesMatch ? parseInt(netTxBytesMatch[1], 10) : 0,
        uptime: uptimeMatch ? parseInt(uptimeMatch[1], 10) : 0,
        status: resolvedStatus,
        guestAgent: virshState === 'running' ? guestAgentOk : null,
        load: [0.15, 0.1, 0.05],
        processes: 25,
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
        guestAgent: null,
        load: [0, 0, 0],
        processes: 0,
      };
    }
  }

  public async files(node: any, instance: any, action: string, path: string, data?: any): Promise<any> {
    const domainName = this.getDomainName(instance.vmid);
    
    // Guest Agent file commands JSON RPC
    if (action === 'read') {
      const openCmd = `virsh qemu-agent-command ${domainName} '{"execute":"guest-file-open","arguments":{"path":"${path}","mode":"r"}}'`;
      const openRes = await NodeClient.executeCommand(node.id, openCmd);
      const handle = JSON.parse(openRes.stdout).return;

      const readCmd = `virsh qemu-agent-command ${domainName} '{"execute":"guest-file-read","arguments":{"handle":${handle}}}'`;
      const readRes = await NodeClient.executeCommand(node.id, readCmd);
      const contentBase64 = JSON.parse(readRes.stdout).return['buf-b64'] || '';
      
      const closeCmd = `virsh qemu-agent-command ${domainName} '{"execute":"guest-file-close","arguments":{"handle":${handle}}}'`;
      await NodeClient.executeCommand(node.id, closeCmd);

      return Buffer.from(contentBase64, 'base64').toString('utf8');
    }

    if (action === 'write') {
      const openCmd = `virsh qemu-agent-command ${domainName} '{"execute":"guest-file-open","arguments":{"path":"${path}","mode":"w"}}'`;
      const openRes = await NodeClient.executeCommand(node.id, openCmd);
      const handle = JSON.parse(openRes.stdout).return;

      const base64Content = Buffer.from(data.content).toString('base64');
      const writeCmd = `virsh qemu-agent-command ${domainName} '{"execute":"guest-file-write","arguments":{"handle":${handle},"buf-b64":"${base64Content}"}}'`;
      await NodeClient.executeCommand(node.id, writeCmd);

      const closeCmd = `virsh qemu-agent-command ${domainName} '{"execute":"guest-file-close","arguments":{"handle":${handle}}}'`;
      await NodeClient.executeCommand(node.id, closeCmd);
      return;
    }

    if (action === 'list') {
      // Execute ls command inside VM using guest-exec
      const lsCmd = `virsh qemu-agent-command ${domainName} '{"execute":"guest-exec","arguments":{"path":"/bin/ls","arg":["-la","--time-style=long-iso","${path}"],"capture-output":true}}'`;
      const lsRes = await NodeClient.executeCommand(node.id, lsCmd);
      const pid = JSON.parse(lsRes.stdout).return.pid;

      // Poll check status
      let stdout = '';
      for (let i = 0; i < 5; i++) {
        const checkCmd = `virsh qemu-agent-command ${domainName} '{"execute":"guest-exec-status","arguments":{"pid":${pid}}}'`;
        const checkRes = await NodeClient.executeCommand(node.id, checkCmd);
        const ret = JSON.parse(checkRes.stdout).return;
        if (ret.exited) {
          stdout = Buffer.from(ret['out-data'] || '', 'base64').toString('utf8');
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Parse list
      return this.parseLsOutput(stdout);
    }
  }

  private parseLsOutput(stdout: string): any[] {
    if (!stdout) return [];
    const lines = stdout.split('\n');
    const items: any[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 8) continue;
      const permissions = parts[0];
      if (permissions.startsWith('total')) continue;
      const owner = parts[2];
      const group = parts[3];
      const sizeBytes = parseInt(parts[4], 10);
      const date = parts[5];
      const time = parts[6];
      const name = parts.slice(7).join(' ');

      if (name === '.' || name === '..') continue;

      items.push({
        name,
        isDirectory: permissions.startsWith('d'),
        size: sizeBytes,
        owner,
        group,
        permissions,
        updatedAt: `${date} ${time}`,
      });
    }
    return items;
  }

  public async terminal(node: any, instance: any, socket: any, cols: number, rows: number, token: string): Promise<any> {
    // VM consoles link to serial sockets or SPICE streams
  }

  public async powerState(node: any, instance: any): Promise<string> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh domstate ${domainName}`);
    if (res.exitCode !== 0) return 'stopped';
    const state = res.stdout.toLowerCase().trim();
    if (state.includes('running')) return 'running';
    if (state.includes('paused')) return 'paused';
    return 'stopped';
  }

  public async information(node: any, instance: any): Promise<any> {
    const domainName = this.getDomainName(instance.vmid);
    const res = await NodeClient.executeCommand(node.id, `virsh dominfo ${domainName}`);
    return res.stdout;
  }

  public async statistics(node: any, instance: any): Promise<any> {
    return this.metrics(node, instance);
  }

  public async healthCheck(node: any, instance: any): Promise<any> {
    const domainName = this.getDomainName(instance.vmid);
    const checks: any = {
      domain_exists: false,
      domain_running: false,
      cpu_assigned: false,
      ram_assigned: false,
      disk_attached: false,
      network_attached: false,
      ip_obtained: false,
      guest_agent_connected: false,
      ssh_reachable: false,
      serial_console_available: false,
      cloud_init_finished: false,
      storage_healthy: false
    };

    let guestIp = instance.ipAddress;
    let consoleOutput = '';
    let agentConnected = false;
    let guestAgentVersion = '';
    let guestAgentCapabilities: string[] = [];
    let sshBanner = '';
    let sshLatency = 0;

    // Resolve Guest Profile
    let templateName = 'ubuntu-22-04';
    if (instance.osTemplate) {
      if (instance.osTemplate.includes(':')) {
        templateName = (instance.osTemplate.split(':').pop() || 'ubuntu-22-04').replace(/\//g, '-');
      } else {
        templateName = instance.osTemplate.replace(/\//g, '-');
      }
    }
    const guestProfile = GuestProfileService.resolveProfile(templateName);

    // 1. Check domain exists and retrieve dominfo
    const dominfoRes = await NodeClient.executeCommand(node.id, `virsh dominfo ${domainName} 2>/dev/null`);
    if (dominfoRes.exitCode === 0) {
      checks.domain_exists = true;

      // 2. Check domain running
      const domstateRes = await NodeClient.executeCommand(node.id, `virsh domstate ${domainName} 2>/dev/null`);
      const state = domstateRes.stdout.trim().toLowerCase();
      if (state.includes('running')) {
        checks.domain_running = true;
      }

      // 3. CPU assigned correctly
      const cpuMatch = dominfoRes.stdout.match(/CPU\(s\):\s+(\d+)/);
      if (cpuMatch) {
        const cores = parseInt(cpuMatch[1], 10);
        checks.cpu_assigned = (cores === instance.cpuCores);
      }

      // 4. RAM assigned correctly
      const memMatch = dominfoRes.stdout.match(/Max memory:\s+(\d+)/);
      if (memMatch) {
        const memKb = parseInt(memMatch[1], 10);
        checks.ram_assigned = (Math.abs(memKb - instance.memoryMb * 1024) < 4096);
      }

      // 5. Disk attached
      const disksRes = await NodeClient.executeCommand(node.id, `virsh domblklist ${domainName} 2>/dev/null`);
      if (disksRes.exitCode === 0 && (disksRes.stdout.includes('disk0') || disksRes.stdout.includes('vda') || disksRes.stdout.includes('sda'))) {
        checks.disk_attached = true;
      }

      // 6. Network attached
      const ifRes = await NodeClient.executeCommand(node.id, `virsh domiflist ${domainName} 2>/dev/null`);
      if (ifRes.exitCode === 0 && (ifRes.stdout.includes('vnet') || ifRes.stdout.includes('bridge') || ifRes.stdout.includes('lxdbr0'))) {
        checks.network_attached = true;
      }

      // 7. Storage healthy
      const diskPath = `/var/lib/libvirt/images/${domainName}_disk0.qcow2`;
      const imgInfoRes = await NodeClient.executeCommand(node.id, `qemu-img info ${diskPath} 2>/dev/null`);
      if (imgInfoRes.exitCode === 0) {
        checks.storage_healthy = true;
      }

      // 8. Guest Agent connected
      if (guestProfile.supportsGuestAgent) {
        const pingAgent = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-ping"}' 2>/dev/null`);
        if (pingAgent.exitCode === 0) {
          checks.guest_agent_connected = true;
          agentConnected = true;

          // Fetch version and capabilities
          const infoAgent = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-info"}' 2>/dev/null`);
          if (infoAgent.exitCode === 0) {
            try {
              const info = JSON.parse(infoAgent.stdout);
              guestAgentVersion = info.return?.version || 'unknown';
              const supportedCmds = info.return?.supported_commands || [];
              
              if (supportedCmds.some((c: any) => c.name === 'guest-shutdown')) guestAgentCapabilities.push('shutdown');
              if (supportedCmds.some((c: any) => c.name === 'guest-exec')) guestAgentCapabilities.push('exec');
              if (supportedCmds.some((c: any) => c.name === 'guest-fsfreeze-freeze')) guestAgentCapabilities.push('fsfreeze');
              if (supportedCmds.some((c: any) => c.name === 'guest-set-user-password')) guestAgentCapabilities.push('password');
              if (supportedCmds.some((c: any) => c.name === 'guest-info')) guestAgentCapabilities.push('guest info');
            } catch (_) {}
          }

          // Try to obtain IP address if not known or set to dhcp
          if (!guestIp || guestIp === 'dhcp') {
            const netRes = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-network-get-interfaces"}' 2>/dev/null`);
            if (netRes.exitCode === 0) {
              try {
                const netInfo = JSON.parse(netRes.stdout);
                const interfaces = netInfo.return || [];
                for (const iface of interfaces) {
                  if (iface.name !== 'lo' && iface['ip-addresses']) {
                    const ipv4 = iface['ip-addresses'].find((ip: any) => ip['ip-address-type'] === 'ipv4');
                    if (ipv4) {
                      guestIp = ipv4['ip-address'];
                      checks.ip_obtained = true;
                      break;
                    }
                  }
                }
              } catch (_) {}
            }
          } else {
            checks.ip_obtained = true;
          }

          // 9. Cloud-init finished
          if (guestProfile.supportsCloudInit) {
            const openFile = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-file-open","arguments":{"path":"/run/cloud-init/result.json","mode":"r"}}' 2>/dev/null`);
            if (openFile.exitCode === 0) {
              checks.cloud_init_finished = true;
              try {
                const handleObj = JSON.parse(openFile.stdout);
                const handle = handleObj.return;
                await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-file-close","arguments":{"handle":${handle}}}' 2>/dev/null`);
              } catch (_) {}
            }
          } else {
            checks.cloud_init_finished = true;
          }
        }
      } else {
        checks.guest_agent_connected = false;
        checks.cloud_init_finished = true;
      }

      // 10. SSH reachable check banner + latency
      if (guestIp && guestIp !== 'dhcp') {
        const sshCheckCmd = `
          start=$(date +%s%N)
          banner=$(timeout 2 head -n 1 < /dev/tcp/${guestIp}/22 2>/dev/null)
          end=$(date +%s%N)
          latency=$(( (end - start) / 1000000 ))
          echo "$banner|$latency"
        `.trim();
        
        const sshRes = await NodeClient.executeCommand(node.id, sshCheckCmd);
        const parts = sshRes.stdout.trim().split('|');
        if (parts[0] && parts[0].includes('SSH-')) {
          checks.ssh_reachable = true;
          sshBanner = parts[0];
          sshLatency = parseInt(parts[1] || '0', 10);
        }
      }

      // 11. Serial console validation
      if (guestProfile.supportsSerialRepair) {
        const consoleRes = await ConsoleService.validate(node.id, domainName);
        consoleOutput = consoleRes.output;
        if (consoleRes.available) {
          checks.serial_console_available = true;
        }
      } else {
        checks.serial_console_available = true; // Not supported or needed, count as active
      }
    }

    const serialConsoleStatus = checks.serial_console_available ? 'available' : 'not_configured';
    const guestAgentStatus = checks.guest_agent_connected ? 'connected' : (guestProfile.supportsGuestAgent ? 'not_installed' : 'unknown');
    const sshStatus = checks.ssh_reachable ? 'reachable' : 'not_reachable';

    let bootDiagnostics = 'Unknown';
    if (checks.domain_exists) {
      if (!checks.domain_running) {
        bootDiagnostics = 'BootFailed';
      } else {
        bootDiagnostics = await this.getBootDiagnostics(consoleOutput, agentConnected);
      }
    }

    return {
      console: { status: serialConsoleStatus, type: instance.vmConfig?.graphicsType || 'serial', lastChecked: new Date() },
      guestAgent: { status: guestAgentStatus, version: guestAgentVersion, capabilities: guestAgentCapabilities },
      ssh: { reachable: checks.ssh_reachable, banner: sshBanner, latency: sshLatency },
      boot: { status: bootDiagnostics },
      healthCheckResults: checks,
      guestIp
    };
  }

  private async getBootDiagnostics(consoleOutput: string, agentConnected: boolean): Promise<string> {
    if (agentConnected) return 'Healthy';
    
    const lowerOutput = (consoleOutput || '').toLowerCase();
    if (lowerOutput.includes('kernel panic') || lowerOutput.includes('panic:')) {
      return 'KernelPanic';
    }
    if (lowerOutput.includes('grub rescue') || lowerOutput.includes('error: no such device')) {
      return 'GrubRescue';
    }
    if (lowerOutput.includes('no bootable device') || lowerOutput.includes('boot failed')) {
      return 'NoBootableDisk';
    }
    if (lowerOutput.includes('filesystem check failed') || lowerOutput.includes('fsck failed')) {
      return 'FilesystemError';
    }
    if (lowerOutput.includes('emergency mode') || lowerOutput.includes('enter runlevel')) {
      return 'EmergencyMode';
    }
    if (lowerOutput.includes('initramfs')) {
      return 'Initramfs';
    }
    if (lowerOutput.includes('cloud-init') && (lowerOutput.includes('error') || lowerOutput.includes('fail'))) {
      return 'CloudInitFailed';
    }
    return 'Unknown';
  }

  public async repairConsole(node: any, instance: any): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const diskPath = `/var/lib/libvirt/images/${domainName}_disk0.qcow2`;
    
    // Resolve OS info
    const guestProfile = GuestProfileService.resolveProfile(instance.osTemplate);
    if (guestProfile.guestType !== 'Linux' || !guestProfile.supportsSerialRepair) {
      throw new Error('Console repair is only supported on configured Linux guests.');
    }

    const dist = guestProfile.distribution.toLowerCase();
    let grubLinePattern = 'GRUB_CMDLINE_LINUX_DEFAULT';
    let grubUpdateCmd = 'update-grub';
    if (['centos', 'rocky', 'alma'].includes(dist)) {
      grubLinePattern = 'GRUB_CMDLINE_LINUX';
      grubUpdateCmd = 'grub2-mkconfig -o /boot/grub2/grub.cfg';
    }

    // Check if Guest Agent is running
    const pingAgent = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-ping"}' 2>/dev/null`);
    const agentWorking = (pingAgent.exitCode === 0);

    const scriptContent = `
#!/bin/bash
if [ -f /etc/default/grub ]; then
  if ! grep -q "console=ttyS0" /etc/default/grub; then
    sed -i 's/\\(${grubLinePattern}=".*\\)"/\\1 console=tty0 console=ttyS0,115200n8"/' /etc/default/grub
  fi
fi
if command -v ${grubUpdateCmd} >/dev/null 2>&1; then
  ${grubUpdateCmd}
fi
if command -v grubby >/dev/null 2>&1; then
  grubby --update-kernel=ALL --args="console=tty0 console=ttyS0,115200n8" || true
fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable serial-getty@ttyS0.service || true
  systemctl start serial-getty@ttyS0.service || true
fi
`.trim();

    if (agentWorking) {
      // 1. Repair online using guest-agent
      const cmdToRun = `echo "${Buffer.from(scriptContent).toString('base64')}" | base64 -d | bash`;
      
      const execArgs = {
        path: '/bin/bash',
        arguments: ['-c', cmdToRun],
        'capture-output': true
      };
      
      await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '${JSON.stringify({
        execute: 'guest-exec',
        arguments: execArgs
      })}'`);
      
      await new Promise(r => setTimeout(r, 3000));
    } else {
      // 2. Repair offline using virt-customize
      const checkVirt = await NodeClient.executeCommand(node.id, "command -v virt-customize && echo yes || echo no");
      if (!checkVirt.stdout.includes('yes')) {
        throw new Error('virt-customize is not installed on the hypervisor host and Guest Agent is not reachable. Cannot perform repair.');
      }

      // Stop VM if it was running
      const domstateRes = await NodeClient.executeCommand(node.id, `virsh domstate ${domainName} 2>/dev/null`);
      const wasRunning = domstateRes.stdout.trim().includes('running');
      if (wasRunning) {
        await NodeClient.executeCommand(node.id, `virsh destroy ${domainName}`);
        await new Promise(r => setTimeout(r, 2000));
      }

      // Write script to node
      const scriptB64 = Buffer.from(scriptContent).toString('base64');
      const tempScriptPath = `/tmp/${domainName}_repair.sh`;
      await NodeClient.executeCommand(node.id, `echo "${scriptB64}" | base64 -d > ${tempScriptPath} && chmod +x ${tempScriptPath}`);

      // Run virt-customize
      const customizeRes = await NodeClient.executeCommand(node.id, `virt-customize -a ${diskPath} --run ${tempScriptPath}`, 180000);
      
      // Cleanup script
      await NodeClient.executeCommand(node.id, `rm -f ${tempScriptPath}`);

      if (wasRunning) {
        await NodeClient.executeCommand(node.id, `virsh start ${domainName}`);
      }

      if (customizeRes.exitCode !== 0) {
        throw new Error(`virt-customize failed during console repair: ${customizeRes.stderr}`);
      }
    }
  }
}

function modifyCloudInit(userData: string, dist: string): string {
  let content = userData.trim();
  if (!content.startsWith('#cloud-config')) {
    content = '#cloud-config\n' + content;
  }

  let lines = content.split('\n');

  const isRootKey = (line: string, key: string) => {
    return line.trim() === `${key}:`;
  };

  const bootcmds = [
    'systemctl enable serial-getty@ttyS0.service'
  ];

  let runcmds: string[] = [];
  if (['centos', 'rocky', 'alma'].includes(dist)) {
    runcmds = [
      `sed -i 's/\\\\(GRUB_CMDLINE_LINUX=".*\\\\)"/\\\\1 console=tty0 console=ttyS0,115200n8"/' /etc/default/grub`,
      'grub2-mkconfig -o /boot/grub2/grub.cfg',
      'grubby --update-kernel=ALL --args="console=tty0 console=ttyS0,115200n8" || true'
    ];
  } else {
    runcmds = [
      `sed -i 's/\\\\(GRUB_CMDLINE_LINUX_DEFAULT=".*\\\\)"/\\\\1 console=tty0 console=ttyS0,115200n8"/' /etc/default/grub`,
      'update-grub'
    ];
  }

  const dnsCmds = [
    'echo -e "nameserver 8.8.8.8\\nnameserver 1.1.1.1" > /etc/resolv.conf',
    'if [ -f /etc/systemd/resolved.conf ]; then sed -i "s/#DNS=/DNS=8.8.8.8 1.1.1.1/g" /etc/systemd/resolved.conf; sed -i "s/DNS=.*/DNS=8.8.8.8 1.1.1.1/g" /etc/systemd/resolved.conf; systemctl restart systemd-resolved || true; fi'
  ];
  runcmds = [...runcmds, ...dnsCmds];

  // 1. Insert bootcmd
  let bootcmdIndex = lines.findIndex(l => isRootKey(l, 'bootcmd'));
  if (bootcmdIndex !== -1) {
    const hasCommand = lines.some((l, idx) => idx > bootcmdIndex && l.includes('serial-getty@ttyS0.service'));
    if (!hasCommand) {
      lines.splice(bootcmdIndex + 1, 0, `  - ${bootcmds[0]}`);
    }
  } else {
    lines.push('bootcmd:');
    lines.push(`  - ${bootcmds[0]}`);
  }

  // 2. Insert runcmd
  let runcmdIndex = lines.findIndex(l => isRootKey(l, 'runcmd'));
  if (runcmdIndex !== -1) {
    const hasGrubCmd = lines.some((l, idx) => idx > runcmdIndex && l.includes('console=ttyS0'));
    if (!hasGrubCmd) {
      runcmds.forEach((cmd, i) => {
        lines.splice(runcmdIndex + 1 + i, 0, `  - ${cmd}`);
      });
    }
  } else {
    lines.push('runcmd:');
    runcmds.forEach(cmd => {
      lines.push(`  - ${cmd}`);
    });
  }

  return lines.join('\n');
}
