import { VirtualizationProvider } from './provider';
import { NodeClient } from './nodeClient';
import { XmlBuilder } from './xmlBuilder';

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

    // 1. Create storage directories and blank QCOW2 disk
    await NodeClient.executeCommand(node.id, `mkdir -p /var/lib/libvirt/images/templates`);
    const diskPath = `/var/lib/libvirt/images/${domainName}_disk0.qcow2`;
    
    // If template / cloud image is specified, copy it as base, else create empty qcow2
    if (data.osTemplate && data.osTemplate.includes(':')) {
      const templateName = data.osTemplate.split(':').pop();
      const templatePath = `/var/lib/libvirt/images/templates/${templateName}.qcow2`;
      
      // Auto download if template doesn't exist on host
      const checkTemplate = await NodeClient.executeCommand(node.id, `ls ${templatePath}`);
      if (checkTemplate.exitCode !== 0) {
        let downloadUrl = `https://cloud-images.ubuntu.com/minimal/releases/jammy/release/ubuntu-22.04-minimal-cloudimg-amd64.img`;
        if (templateName?.includes('debian')) {
          downloadUrl = `https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2`;
        } else if (templateName?.includes('alpine')) {
          downloadUrl = `https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/alpine-virt-3.19.0-x86_64.iso`;
        }
        await NodeClient.executeCommand(node.id, `curl -sSL -o ${templatePath} ${downloadUrl}`);
      }
      
      // Copy template to primary disk
      await NodeClient.executeCommand(node.id, `cp ${templatePath} ${diskPath}`);
      await NodeClient.executeCommand(node.id, `qemu-img resize ${diskPath} ${storageGb}G`);
    } else {
      // Create empty disk
      await NodeClient.executeCommand(node.id, `qemu-img create -f qcow2 ${diskPath} ${storageGb}G`);
    }

    // 2. Generate Cloud-init ISO (if enabled)
    let disks = [{ name: 'disk0', sizeGb: storageGb, isIso: false, type: 'virtio' }];
    if (data.cloudInit?.enabled || instance.cloudInit?.enabled) {
      const userData = data.cloudInit?.userData || '';
      const metaData = data.cloudInit?.metaData || `instance-id: ${instance.id}\nlocal-hostname: ${data.hostname || instance.hostname}`;
      
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
      disks.push({ name: 'cloudinit', sizeGb: 0, isIso: true, type: 'ide', isoPath: cloudInitIsoPath } as any);
    }

    // 3. Compile Domain XML
    const xml = XmlBuilder.build(
      { vmid, name: instance.name, id: instance.id, cpuCores, memoryMb, storageGb },
      data.vmConfig || {},
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
    if (data.vmConfig?.guestAgent) {
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

      const memoryTotal = memTotalMatch ? parseInt(memTotalMatch[1], 10) * 1024 : instance.memoryMb * 1024 * 1024;
      const memoryUnused = memUnusedMatch ? parseInt(memUnusedMatch[1], 10) * 1024 : 0;
      const memoryUsed = memoryTotal - memoryUnused;

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
        status: stateMatch ? stateMatch[1].trim().toLowerCase() : 'stopped',
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
}
