import { VirtualizationProvider } from './provider';
import { NodeClient } from './nodeClient';
import { XmlBuilder } from './xmlBuilder';
import { FirmwareDetector } from './firmwareDetector';
import { GuestProfileService, GuestProfile } from './guestProfileService';
import { ConsoleService } from './consoleService';
import { db } from '../../db';
import { TaskService } from '../taskService';

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

    // Run Deployment Preflight Checklist (fails fast and prevents phantom VM creation)
    const taskId = data.taskId;
    if (taskId) {
      TaskService.updateTask(taskId, {
        progress: 15,
        currentStage: 'Preflight',
        currentStep: 'Running deployment preflight checks...',
        logMessage: 'Verifying host bridge, storage pool, unique MAC, and UEFI firmware availability...'
      });
    }
    await this.runDeploymentPreflight(node, data, guestProfile);


    // 1. Create storage directories and blank QCOW2 disk
    await NodeClient.executeCommand(node.id, `mkdir -p /var/lib/libvirt/images/templates`);
    const diskPath = `/var/lib/libvirt/images/${domainName}_disk0.qcow2`;

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
        if (taskId) {
          TaskService.updateTask(taskId, {
            progress: 30,
            currentStage: 'Downloading Image',
            currentStep: `Downloading cloud image: ${templateName}`,
            logMessage: `Fetching base image from ${downloadUrl}...`
          });
        }
        const dl = await NodeClient.executeCommand(node.id, `curl -sSL -o ${templatePath} ${downloadUrl}`);
        if (dl.exitCode !== 0) {
          throw new Error(`Failed to download cloud image: ${dl.stderr}`);
        }
      }
      
      if (taskId) {
        TaskService.updateTask(taskId, {
          progress: 50,
          currentStage: 'Creating Disk',
          currentStep: 'Allocating VM disk space...',
          logMessage: `Cloning storage template to ${diskPath} and resizing...`
        });
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
    const nics = data.networkInterfaces || [{ bridge: 'lxdbr0', macAddress: '52:54:00:12:34:56', nicModel: 'virtio' }];

    if (taskId) {
      TaskService.updateTask(taskId, {
        progress: 60,
        currentStage: 'Generating Cloud-init',
        currentStep: 'Building configuration metadata...',
        logMessage: 'Generating dynamic network-config and user-data configurations...'
      });
    }

    if (useCloudInit) {
      const userData = generateCloudInitUserData(instance, data, guestProfile);
      const metaData = `instance-id: ${instance.id}\nlocal-hostname: ${data.hostname || instance.hostname}`;
      const networkConfig = generateCloudInitNetworkConfig(nics);

      const userDataPath = `/tmp/${domainName}_user-data`;
      const metaDataPath = `/tmp/${domainName}_meta-data`;
      const netConfigPath = `/tmp/${domainName}_network-config`;
      const cloudInitIsoPath = `/var/lib/libvirt/images/${domainName}_cloudinit.iso`;

      // Write files on node using command injection redirection
      await NodeClient.executeCommand(node.id, `echo "${Buffer.from(userData).toString('base64')}" | base64 -d > ${userDataPath}`);
      await NodeClient.executeCommand(node.id, `echo "${Buffer.from(metaData).toString('base64')}" | base64 -d > ${metaDataPath}`);
      await NodeClient.executeCommand(node.id, `echo "${Buffer.from(networkConfig).toString('base64')}" | base64 -d > ${netConfigPath}`);
      
      // Run genisoimage with network-config included
      await NodeClient.executeCommand(
        node.id,
        `genisoimage -output ${cloudInitIsoPath} -volid cidata -joliet -rock ${userDataPath} ${metaDataPath} ${netConfigPath}`
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

        const guestAgentInstaller = generateGuestAgentInstallScript(dist);
        const mainNic = nics[0] || { bridge: 'lxdbr0', macAddress: '52:54:00:12:34:56' };

        const networkConfigurator = `
# Auto detect interface name inside guest
iface=$(ip -o link show | awk -F': ' '$2 != "lo" {print $2}' | grep -E '^(en|eth|es)' | head -n 1)
if [ -z "$iface" ]; then
  iface="eth0"
fi
${generateOfflineGuestNetworkConfigScript(dist, "$iface", mainNic.macAddress, mainNic)}
`.trim();

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

# Auto install guest agent if supported
${guestAgentInstaller}

# Auto configure network offline
${networkConfigurator}
`.trim();

        const scriptB64 = Buffer.from(scriptContent).toString('base64');
        const tempScriptPath = `/tmp/${domainName}_guest_custom.sh`;
        
        await NodeClient.executeCommand(node.id, `echo "${scriptB64}" | base64 -d > ${tempScriptPath} && chmod +x ${tempScriptPath}`);
        await NodeClient.executeCommand(node.id, `virt-customize -a ${diskPath} --run ${tempScriptPath}`, 180000);
        await NodeClient.executeCommand(node.id, `rm -f ${tempScriptPath}`);
      }
    }

    // 3. Compile Domain XML
    if (taskId) {
      TaskService.updateTask(taskId, {
        progress: 70,
        currentStage: 'Creating Domain',
        currentStep: 'Defining libvirt guest domains...',
        logMessage: 'Compiling target domain XML structure...'
      });
    }
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

    if (taskId) {
      TaskService.updateTask(taskId, {
        progress: 75,
        currentStage: 'Starting VM',
        currentStep: 'Booting VM domain...',
        logMessage: 'Launching libvirt start commands...'
      });
    }
    const startRes = await NodeClient.executeCommand(node.id, `virsh start ${domainName}`);
    if (startRes.exitCode !== 0) {
      // Rollback on define
      await NodeClient.executeCommand(node.id, `virsh undefine ${domainName}`);
      throw new Error(`Failed to boot VM: ${startRes.stderr}`);
    }

    // 5. Run VM Network Verification Pipeline (Fails fast and triggers full rollback)
    console.log(`Starting Network Verification Pipeline for ${domainName}...`);
    let verified = false;
    let errMessage = '';
    const verificationTimeout = 120000;
    const vStart = Date.now();
    const mainNic = nics[0];
    const bridge = mainNic.bridge || 'lxdbr0';

    if (taskId) {
      TaskService.updateTask(taskId, {
        progress: 80,
        currentStage: 'Waiting Guest Agent',
        currentStep: 'Establishing Guest Agent communication channel...',
        logMessage: 'Awaiting QEMU Guest Agent initialization...'
      });
    }

    while (Date.now() - vStart < verificationTimeout) {
      try {
        // Step 1: NIC device attached in XML
        const nicRes = await NodeClient.executeCommand(node.id, `virsh domiflist ${domainName} | grep -i "${mainNic.macAddress}" || true`);
        if (!nicRes.stdout.trim()) {
          throw new Error('NIC interface device is not attached in the libvirt domain XML.');
        }

        // Step 2: Link is carrier UP on host
        if (!nicRes.stdout.toLowerCase().includes('up')) {
          const checkTap = await NodeClient.executeCommand(node.id, `ip link show | grep -i "${mainNic.macAddress}" || true`);
          if (!checkTap.stdout.trim() && !nicRes.stdout.includes('vnet')) {
            throw new Error('NIC link state is DOWN.');
          }
        }

        // Step 3: IP lease/address allocated
        if (taskId) {
          TaskService.updateTask(taskId, {
            progress: 85,
            currentStage: 'Waiting DHCP',
            currentStep: 'Waiting for guest to obtain IPv4 address...',
            logMessage: `Querying hypervisor ARP, DHCP leases, and Guest Agent endpoints...`
          });
        }
        const ip = await detectGuestIp(node.id, domainName, mainNic.macAddress, bridge);
        if (!ip) {
          throw new Error('Guest interface did not receive an IPv4 address (waiting for DHCP/static allocation).');
        }

        // Step 4: Guest Agent ping check
        if (vmConfig?.guestAgent) {
          const pingAgent = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-ping"}' 2>/dev/null`);
          if (pingAgent.exitCode !== 0) {
            throw new Error('QEMU Guest Agent is not reachable yet.');
          }

          // Step 5: Gateway route validation
          if (taskId) {
            TaskService.updateTask(taskId, {
              progress: 90,
              currentStage: 'Configuring Network',
              currentStep: 'Verifying gateway configuration...',
              logMessage: `Validating guest routing tables...`
            });
          }
          const execRoute = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-exec","arguments":{"path":"/bin/bash","arguments":["-c","ip route show | grep default"],"capture-output":true}}' 2>/dev/null`);
          let hasGateway = false;
          if (execRoute.exitCode === 0) {
            try {
              const resObj = JSON.parse(execRoute.stdout);
              const outB64 = resObj.return?.['out-data'] || '';
              const outStr = Buffer.from(outB64, 'base64').toString('utf8');
              if (outStr.includes('default via') || outStr.includes('default dev')) {
                hasGateway = true;
              }
            } catch (_) {}
          }
          if (!hasGateway) {
            throw new Error('Default gateway route is missing in the guest routing table.');
          }

          // Step 6: DNS resolution validation
          if (taskId) {
            TaskService.updateTask(taskId, {
              progress: 93,
              currentStage: 'Testing DNS',
              currentStep: 'Resolving DNS names inside guest...',
              logMessage: `Verifying nameserver lookups...`
            });
          }
          const execDns = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-exec","arguments":{"path":"/bin/bash","arguments":["-c","getent hosts google.com || nslookup google.com"],"capture-output":true}}' 2>/dev/null`);
          let dnsWorks = false;
          if (execDns.exitCode === 0) {
            try {
              const resObj = JSON.parse(execDns.stdout);
              if (resObj.return?.exitcode === 0) {
                dnsWorks = true;
              }
            } catch (_) {}
          }
          if (!dnsWorks) {
            throw new Error('DNS resolver name resolution test failed inside the guest.');
          }

          // Step 7: Internet reachability check
          if (taskId) {
            TaskService.updateTask(taskId, {
              progress: 96,
              currentStage: 'Testing Internet',
              currentStep: 'Testing public ICMP/TCP connections...',
              logMessage: `Pinging 8.8.8.8 and querying GitHub HTTPS APIs...`
            });
          }
          const execPing = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-exec","arguments":{"path":"/bin/bash","arguments":["-c","ping -c 1 -W 2 8.8.8.8 && curl -s -I --connect-timeout 2 https://github.com"],"capture-output":true}}' 2>/dev/null`);
          let internetWorks = false;
          if (execPing.exitCode === 0) {
            try {
              const resObj = JSON.parse(execPing.stdout);
              if (resObj.return?.exitcode === 0) {
                internetWorks = true;
              }
            } catch (_) {}
          }
          if (!internetWorks) {
            throw new Error('Internet connectivity check failed (ping/TCP target unreachable).');
          }
        }

        verified = true;
        break;
      } catch (checkErr: any) {
        errMessage = checkErr.message;
        await new Promise((r) => setTimeout(r, 4000));
      }
    }

    if (!verified) {
      console.error(`ROLLBACK: Network validation failed. Destroying VM domain and disks. Reason: ${errMessage}`);
      await NodeClient.executeCommand(node.id, `virsh destroy ${domainName} 2>/dev/null || true`);
      await NodeClient.executeCommand(node.id, `virsh undefine ${domainName} --remove-all-storage --snapshots-metadata 2>/dev/null || true`);
      
      const xmlPath = `/tmp/${domainName}.xml`;
      const cloudInitIsoPath = `/var/lib/libvirt/images/${domainName}_cloudinit.iso`;
      await NodeClient.executeCommand(node.id, `rm -f ${diskPath} ${cloudInitIsoPath} ${xmlPath}`);
      
      throw new Error(`Deployment Aborted & Rolled Back: ${errMessage}`);
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
      storage_healthy: false,
      nic_attached: false,
      link_up: false,
      driver_loaded: false,
      gateway_present: false,
      dns_configured: false,
      internet_reachable: false
    };

    let guestIp = instance.ipAddress;
    let consoleOutput = '';
    let agentConnected = false;
    let guestAgentVersion = '';
    let guestAgentCapabilities: string[] = [];
    let sshBanner = '';
    let sshLatency = 0;
    let targetDevice = 'vnet0';

    let rxBytes = 0, txBytes = 0, rxPackets = 0, txPackets = 0, rxErrors = 0, txErrors = 0, rxDrop = 0, txDrop = 0;

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

      // 6. Network interface check (NIC attached & Link UP)
      const ifRes = await NodeClient.executeCommand(node.id, `virsh domiflist ${domainName} 2>/dev/null`);
      if (ifRes.exitCode === 0) {
        checks.nic_attached = true;
        checks.network_attached = true;
        const match = ifRes.stdout.match(/(vnet\d+|tap\d+)/);
        if (match) {
          targetDevice = match[1];
        }
        if (ifRes.stdout.toLowerCase().includes('up') || ifRes.stdout.includes('vnet')) {
          checks.link_up = true;
        }
      }

      // Read live domifstat metrics
      const statRes = await NodeClient.executeCommand(node.id, `virsh domifstat ${domainName} ${targetDevice} 2>/dev/null`);
      if (statRes.exitCode === 0) {
        const lines = statRes.stdout.trim().split('\n');
        lines.forEach(l => {
          const p = l.trim().split(/\s+/);
          if (p[1] === 'rx_bytes') rxBytes = parseInt(p[2] || '0', 10);
          if (p[1] === 'tx_bytes') txBytes = parseInt(p[2] || '0', 10);
          if (p[1] === 'rx_packets') rxPackets = parseInt(p[2] || '0', 10);
          if (p[1] === 'tx_packets') txPackets = parseInt(p[2] || '0', 10);
          if (p[1] === 'rx_errs') rxErrors = parseInt(p[2] || '0', 10);
          if (p[1] === 'tx_errs') txErrors = parseInt(p[2] || '0', 10);
          if (p[1] === 'rx_drop') rxDrop = parseInt(p[2] || '0', 10);
          if (p[1] === 'tx_drop') txDrop = parseInt(p[2] || '0', 10);
        });
      }

      // 7. Storage healthy
      const diskPath = `/var/lib/libvirt/images/${domainName}_disk0.qcow2`;
      const imgInfoRes = await NodeClient.executeCommand(node.id, `qemu-img info ${diskPath} 2>/dev/null`);
      if (imgInfoRes.exitCode === 0) {
        checks.storage_healthy = true;
      }

      // Multi-Source IP Detection
      const macAddress = instance.networkInterfaces?.[0]?.macAddress || '52:54:00:12:34:56';
      const detectedIp = await detectGuestIp(node.id, domainName, macAddress, instance.networkInterfaces?.[0]?.bridge || 'lxdbr0');
      if (detectedIp) {
        guestIp = detectedIp;
        checks.ip_obtained = true;
        checks.driver_loaded = true;
      }

      // 8. Guest Agent connected & Internal checks
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

          // Guest Agent route, gateway & resolver checks
          const execRoute = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-exec","arguments":{"path":"/bin/bash","arguments":["-c","ip route show | grep default"],"capture-output":true}}' 2>/dev/null`);
          if (execRoute.exitCode === 0) {
            try {
              const resObj = JSON.parse(execRoute.stdout);
              const outB64 = resObj.return?.['out-data'] || '';
              const outStr = Buffer.from(outB64, 'base64').toString('utf8');
              if (outStr.includes('default via') || outStr.includes('default dev')) {
                checks.gateway_present = true;
              }
            } catch (_) {}
          }

          const execDns = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-exec","arguments":{"path":"/bin/bash","arguments":["-c","getent hosts google.com || nslookup google.com"],"capture-output":true}}' 2>/dev/null`);
          if (execDns.exitCode === 0) {
            try {
              const resObj = JSON.parse(execDns.stdout);
              if (resObj.return?.exitcode === 0) {
                checks.dns_configured = true;
              }
            } catch (_) {}
          }

          const execPing = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-exec","arguments":{"path":"/bin/bash","arguments":["-c","ping -c 1 -W 2 8.8.8.8 && curl -s -I --connect-timeout 2 https://github.com"],"capture-output":true}}' 2>/dev/null`);
          if (execPing.exitCode === 0) {
            try {
              const resObj = JSON.parse(execPing.stdout);
              if (resObj.return?.exitcode === 0) {
                checks.internet_reachable = true;
              }
            } catch (_) {}
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
        checks.serial_console_available = true;
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
      guestIp,
      networkStats: {
        interface: targetDevice,
        rxBytes,
        txBytes,
        rxPackets,
        txPackets,
        rxErrors,
        txErrors,
        rxDrop,
        txDrop
      }
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

  public async repairNetwork(node: any, instance: any): Promise<void> {
    const domainName = this.getDomainName(instance.vmid);
    const guestProfile = GuestProfileService.resolveProfile(instance.osTemplate);
    const dist = guestProfile.distribution.toLowerCase();

    const pingAgent = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-ping"}' 2>/dev/null`);
    if (pingAgent.exitCode !== 0) {
      throw new Error('QEMU Guest Agent is unreachable. Cannot perform online network repair.');
    }

    const getIface = await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '{"execute":"guest-network-get-interfaces"}' 2>/dev/null`);
    let iface = 'eth0';
    if (getIface.exitCode === 0) {
      try {
        const netInfo = JSON.parse(getIface.stdout);
        const interfaces = netInfo.return || [];
        const main = interfaces.find((i: any) => i.name !== 'lo');
        if (main) iface = main.name;
      } catch (_) {}
    }

    let cmd = '';
    if (['ubuntu', 'debian'].includes(dist)) {
      cmd = `
        systemctl restart systemd-networkd || systemctl restart networking
        netplan apply || true
        dhclient -r ${iface} && dhclient ${iface} || true
        systemctl restart qemu-guest-agent || true
      `;
    } else if (['centos', 'rocky', 'alma'].includes(dist)) {
      cmd = `
        systemctl restart NetworkManager
        nmcli connection up ${iface} || true
        systemctl restart qemu-guest-agent || true
      `;
    } else if (dist === 'alpine') {
      cmd = `
        rc-service networking restart
        rc-service qemu-guest-agent restart || true
      `;
    } else {
      cmd = `
        systemctl restart systemd-networkd || systemctl restart NetworkManager || true
        dhclient -r || true
        dhclient || true
      `;
    }

    const execArgs = {
      path: '/bin/bash',
      arguments: ['-c', cmd.trim()],
      'capture-output': true
    };

    await NodeClient.executeCommand(node.id, `virsh qemu-agent-command ${domainName} '${JSON.stringify({
      execute: 'guest-exec',
      arguments: execArgs
    })}'`);
  }


  private async runDeploymentPreflight(node: any, data: any, guestProfile: GuestProfile): Promise<void> {
    // 1. Node Health Check
    if (node.status !== 'online' || node.maintenanceMode) {
      throw new Error(`Preflight check failed: Hypervisor node ${node.name || node.id} is offline or in maintenance mode.`);
    }

    // 2. Network & Bridge exist & MAC uniqueness
    const nics = data.networkInterfaces || [{ bridge: 'lxdbr0', macAddress: '52:54:00:12:34:56', nicModel: 'virtio' }];
    for (const nic of nics) {
      const bridge = nic.bridge || 'lxdbr0';
      const checkBridge = await NodeClient.executeCommand(node.id, `ip link show ${bridge} 2>/dev/null || virsh net-info ${bridge} 2>/dev/null`);
      if (checkBridge.exitCode !== 0) {
        throw new Error(`Preflight check failed: Network bridge interface '${bridge}' does not exist on the hypervisor host.`);
      }

      // MAC Uniqueness Check
      const existingNic = await db.networkInterface.findFirst({
        where: { macAddress: nic.macAddress }
      });
      if (existingNic) {
        throw new Error(`Preflight check failed: Unique MAC address violation. MAC address '${nic.macAddress}' is already assigned in the database.`);
      }

      // NIC Model Validation
      const model = (nic.nicModel || 'virtio').toLowerCase();
      if (!['virtio', 'e1000', 'rtl8139', 'vmxnet3', 'ne2k_pci', 'pcnet', 'virtio-net-pci'].includes(model)) {
        throw new Error(`Preflight check failed: Unsupported NIC model '${nic.nicModel}'. Supported: virtio, e1000, rtl8139, vmxnet3.`);
      }
    }

    // 3. Storage Pool Checks
    const checkPool = await NodeClient.executeCommand(node.id, `virsh pool-info default 2>/dev/null`);
    if (checkPool.exitCode !== 0) {
      throw new Error(`Preflight check failed: Default storage pool is not active or defined on the hypervisor.`);
    }

    // 4. ISO/QCOW2 Image pre-existence checks
    if (data.osTemplate && data.osTemplate.includes(':')) {
      const templateName = (data.osTemplate.split(':').pop() || 'ubuntu-22-04').replace(/\//g, '-');
      const templatePath = `/var/lib/libvirt/images/templates/${templateName}.qcow2`;
      const checkTemplate = await NodeClient.executeCommand(node.id, `ls ${templatePath} 2>/dev/null`);
      if (checkTemplate.exitCode !== 0) {
        const checkDownloader = await NodeClient.executeCommand(node.id, `command -v curl || command -v wget`);
        if (checkDownloader.exitCode !== 0) {
          throw new Error(`Preflight check failed: Base template image is missing and neither 'curl' nor 'wget' is available on the node.`);
        }
      }
    }

    // 5. OVMF Firmware Checks
    if (data.vmConfig?.uefi) {
      const checkOvmf = await NodeClient.executeCommand(node.id, `ls /usr/share/OVMF/OVMF_CODE.fd /usr/share/qemu/OVMF.fd 2>/dev/null | wc -l`);
      if (parseInt(checkOvmf.stdout || '0', 10) === 0) {
        throw new Error(`Preflight check failed: UEFI boot requested but OVMF firmware packages are not installed on the hypervisor.`);
      }
    }

    // 6. DHCP Daemon Checks
    const checkDhcp = await NodeClient.executeCommand(node.id, `systemctl is-active dnsmasq 2>/dev/null || systemctl is-active systemd-resolved 2>/dev/null || systemctl is-active isc-dhcp-server 2>/dev/null || echo inactive`);
    if (checkDhcp.stdout.trim() === 'inactive') {
      const checkPs = await NodeClient.executeCommand(node.id, `pgrep dnsmasq 2>/dev/null || echo none`);
      if (checkPs.stdout.includes('none')) {
        console.warn(`Preflight warning: No active DHCP daemon detected on the hypervisor node.`);
      }
    }

    // 7. Cloud-init profile validation
    const useCloudInit = !!(data.cloudInit?.enabled);
    if (useCloudInit && !guestProfile.supportsCloudInit) {
      throw new Error(`Preflight check failed: Cloud-init requested but guest profile ${guestProfile.distribution} does not support cloud-init.`);
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

async function detectGuestIp(nodeId: string, domainName: string, macAddress: string, bridge: string): Promise<string> {
  const cleanMac = macAddress.toLowerCase().trim();

  // 1. QEMU Guest Agent
  const agentRes = await NodeClient.executeCommand(nodeId, `virsh qemu-agent-command ${domainName} '{"execute":"guest-network-get-interfaces"}' 2>/dev/null`);
  if (agentRes.exitCode === 0) {
    try {
      const netInfo = JSON.parse(agentRes.stdout);
      const interfaces = netInfo.return || [];
      for (const iface of interfaces) {
        if (iface.name !== 'lo' && iface['ip-addresses']) {
          const ipv4 = iface['ip-addresses'].find((ip: any) => ip['ip-address-type'] === 'ipv4');
          if (ipv4) return ipv4['ip-address'];
        }
      }
    } catch (_) {}
  }

  // 2. virsh domifaddr (agent)
  const domifResAgent = await NodeClient.executeCommand(nodeId, `virsh domifaddr ${domainName} --source agent 2>/dev/null`);
  if (domifResAgent.exitCode === 0) {
    const match = domifResAgent.stdout.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (match) return match[1];
  }

  // 3. virsh domifaddr (lease)
  const domifResLease = await NodeClient.executeCommand(nodeId, `virsh domifaddr ${domainName} --source lease 2>/dev/null`);
  if (domifResLease.exitCode === 0) {
    const match = domifResLease.stdout.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (match) return match[1];
  }

  // 4. DHCP leases files search
  const dhcpRes = await NodeClient.executeCommand(nodeId, `cat /var/lib/libvirt/dnsmasq/*.leases /var/lib/misc/dnsmasq.leases /var/lib/dnsmasq/*.leases 2>/dev/null | grep -i "${cleanMac}" || true`);
  if (dhcpRes.exitCode === 0 && dhcpRes.stdout.trim()) {
    const parts = dhcpRes.stdout.trim().split(/\s+/);
    if (parts[2] && parts[2].match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
      return parts[2];
    }
  }

  // 5. ARP/neighbour table match
  const arpRes = await NodeClient.executeCommand(nodeId, `ip neigh show 2>/dev/null | grep -i "${cleanMac}" || true`);
  if (arpRes.exitCode === 0 && arpRes.stdout.trim()) {
    const match = arpRes.stdout.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (match) return match[1];
  }

  return '';
}

function generateCloudInitUserData(instance: any, data: any, guestProfile: GuestProfile): string {
  const dist = guestProfile.distribution.toLowerCase();
  const timezone = data.cloudInit?.timezone || 'UTC';
  const locale = data.cloudInit?.locale || 'en_US.UTF-8';
  const password = data.password || instance.password;
  const hostname = data.hostname || instance.hostname;
  const fqdn = data.fqdn || `${hostname}.local`;
  const sshKeys = data.cloudInit?.sshKeys || [];
  const packages = data.cloudInit?.packages || [];
  
  let yaml = `#cloud-config
hostname: ${hostname}
fqdn: ${fqdn}
timezone: ${timezone}
locale: ${locale}
`;

  // Users config
  yaml += `users:
  - name: root
    plain_text_passwd: "${password}"
    lock_passwd: false
`;
  if (sshKeys.length > 0) {
    yaml += `    ssh_authorized_keys:\n`;
    sshKeys.forEach((key: string) => {
      yaml += `      - "${key}"\n`;
    });
  }

  // Packages to install
  const requiredPkgs = [...packages];
  if (guestProfile.supportsGuestAgent) {
    requiredPkgs.push('qemu-guest-agent');
  }
  if (requiredPkgs.length > 0) {
    yaml += `packages:\n`;
    requiredPkgs.forEach(pkg => {
      yaml += `  - ${pkg}\n`;
    });
  }

  // Bootcmd
  yaml += `bootcmd:
  - systemctl enable serial-getty@ttyS0.service || true
  - systemctl start serial-getty@ttyS0.service || true
`;

  // Runcmd
  yaml += `runcmd:
  - systemctl restart qemu-guest-agent || true
`;
  let grubLinePattern = 'GRUB_CMDLINE_LINUX_DEFAULT';
  let grubUpdateCmd = 'update-grub';
  if (['centos', 'rocky', 'alma'].includes(dist)) {
    grubLinePattern = 'GRUB_CMDLINE_LINUX';
    grubUpdateCmd = 'grub2-mkconfig -o /boot/grub2/grub.cfg';
  }
  yaml += `  - sed -i 's/\\(${grubLinePattern}=".*\\)"/\\1 console=tty0 console=ttyS0,115200n8"/' /etc/default/grub\n`;
  yaml += `  - ${grubUpdateCmd} || true\n`;
  yaml += `  - grubby --update-kernel=ALL --args="console=tty0 console=ttyS0,115200n8" || true\n`;

  // Write files
  if (data.cloudInit?.writeFiles && data.cloudInit.writeFiles.length > 0) {
    yaml += `write_files:\n`;
    data.cloudInit.writeFiles.forEach((file: any) => {
      yaml += `  - path: "${file.path}"\n`;
      yaml += `    permissions: "${file.permissions || '0644'}"\n`;
      yaml += `    owner: "${file.owner || 'root:root'}"\n`;
      yaml += `    content: |\n`;
      const lines = file.content.split('\n');
      lines.forEach((line: string) => {
        yaml += `      ${line}\n`;
      });
    });
  }

  return yaml;
}

function generateCloudInitNetworkConfig(nics: any[]): string {
  let yaml = "version: 2\nethernets:\n";
  nics.forEach((nic, idx) => {
    const id = nic.name || `eth${idx}`;
    yaml += `  ${id}:\n`;
    yaml += `    match:\n`;
    yaml += `      macaddress: "${nic.macAddress.toLowerCase()}"\n`;
    yaml += `    set-name: "${id}"\n`;
    if (nic.mtu) {
      yaml += `    mtu: ${nic.mtu}\n`;
    }
    
    // IPv4 Config
    if (nic.ipv4Address === 'dhcp' || !nic.ipv4Address) {
      yaml += `    dhcp4: true\n`;
    } else {
      yaml += `    dhcp4: false\n`;
      yaml += `    addresses:\n`;
      yaml += `      - ${nic.ipv4Address}\n`;
      if (nic.gateway) {
        yaml += `    gateway4: ${nic.gateway}\n`;
      }
    }

    // IPv6 Config
    if (nic.ipv6Address) {
      if (nic.ipv6Address === 'dhcp') {
        yaml += `    dhcp6: true\n`;
      } else {
        yaml += `    dhcp6: false\n`;
        yaml += `    addresses:\n`;
        yaml += `      - ${nic.ipv6Address}\n`;
        if (nic.gateway6) {
          yaml += `    gateway6: ${nic.gateway6}\n`;
        }
      }
    }

    // DNS nameservers
    if (nic.dnsServers && nic.dnsServers.length > 0) {
      yaml += `    nameservers:\n`;
      yaml += `      addresses:\n`;
      nic.dnsServers.forEach((dns: string) => {
        yaml += `        - ${dns}\n`;
      });
      if (nic.searchDomains && nic.searchDomains.length > 0) {
        yaml += `      search:\n`;
        nic.searchDomains.forEach((dom: string) => {
          yaml += `        - ${dom}\n`;
        });
      }
    }

    // Routes
    if (nic.routes && nic.routes.length > 0) {
      yaml += `    routes:\n`;
      nic.routes.forEach((r: any) => {
        yaml += `      - to: "${r.to}"\n`;
        yaml += `        via: "${r.via}"\n`;
        if (r.metric) {
          yaml += `        metric: ${r.metric}\n`;
        }
      });
    }
  });

  // Handle VLANs if any
  const vlanNics = nics.filter(nic => nic.vlan);
  if (vlanNics.length > 0) {
    yaml += "vlans:\n";
    vlanNics.forEach((nic, idx) => {
      const parentId = nic.name || `eth${idx}`;
      yaml += `  vlan${nic.vlan}:\n`;
      yaml += `    id: ${nic.vlan}\n`;
      yaml += `    link: "${parentId}"\n`;
      yaml += `    dhcp4: true\n`;
    });
  }

  return yaml;
}

function generateGuestAgentInstallScript(dist: string): string {
  const lowercaseDist = dist.toLowerCase();
  if (['ubuntu', 'debian'].includes(lowercaseDist)) {
    return `
if ! command -v qemu-guest-agent >/dev/null 2>&1; then
  apt-get update -y || true
  apt-get install -y qemu-guest-agent || true
fi
systemctl enable qemu-guest-agent || true
systemctl start qemu-guest-agent || true
`.trim();
  }
  if (['centos', 'rocky', 'alma'].includes(lowercaseDist)) {
    return `
if ! command -v qemu-guest-agent >/dev/null 2>&1; then
  yum install -y qemu-guest-agent || true
fi
systemctl enable qemu-guest-agent || true
systemctl start qemu-guest-agent || true
`.trim();
  }
  if (lowercaseDist === 'alpine') {
    return `
if ! command -v qemu-guest-agent >/dev/null 2>&1; then
  apk add qemu-guest-agent || true
fi
rc-update add qemu-guest-agent default || true
rc-service qemu-guest-agent start || true
`.trim();
  }
  if (lowercaseDist === 'arch') {
    return `
if ! command -v qemu-guest-agent >/dev/null 2>&1; then
  pacman -Sy --noconfirm qemu-guest-agent || true
fi
systemctl enable qemu-guest-agent || true
systemctl start qemu-guest-agent || true
`.trim();
  }
  return '';
}

function generateOfflineGuestNetworkConfigScript(dist: string, iface: string, mac: string, nic: any): string {
  const lowercaseDist = dist.toLowerCase();
  const ipv4 = nic.ipv4Address || 'dhcp';
  const gateway = nic.gateway;
  const dnsServers = nic.dnsServers || ['8.8.8.8', '1.1.1.1'];
  
  if (lowercaseDist === 'ubuntu') {
    let netplanYaml = `
network:
  version: 2
  renderer: networkd
  ethernets:
    ${iface}:
      match:
        macaddress: "${mac.toLowerCase()}"
      set-name: ${iface}
`;
    if (ipv4 === 'dhcp') {
      netplanYaml += `      dhcp4: true\n`;
    } else {
      netplanYaml += `      dhcp4: false\n`;
      netplanYaml += `      addresses: [ ${ipv4} ]\n`;
      if (gateway) netplanYaml += `      gateway4: ${gateway}\n`;
      netplanYaml += `      nameservers:\n        addresses: [ ${dnsServers.join(', ')} ]\n`;
    }

    return `
cat << 'EOF' > /etc/netplan/01-netcfg.yaml
${netplanYaml.trim()}
EOF
chmod 600 /etc/netplan/01-netcfg.yaml
netplan generate || true
netplan apply || true
`.trim();
  }

  if (lowercaseDist === 'debian' || lowercaseDist === 'alpine') {
    let config = `auto ${iface}\niface ${iface} inet `;
    if (ipv4 === 'dhcp') {
      config += 'dhcp';
    } else {
      const [ipOnly, subnet] = ipv4.split('/');
      let netmask = '255.255.255.0';
      if (subnet) {
        const maskNum = parseInt(subnet, 10);
        const maskBits = (0xffffffff << (32 - maskNum)) >>> 0;
        netmask = [
          (maskBits >>> 24) & 0xff,
          (maskBits >>> 16) & 0xff,
          (maskBits >>> 8) & 0xff,
          maskBits & 0xff
        ].join('.');
      }
      config += `static\n  address ${ipOnly}\n  netmask ${netmask}`;
      if (gateway) config += `\n  gateway ${gateway}`;
      config += `\n  dns-nameservers ${dnsServers.join(' ')}`;
    }

    return `
if [ -f /etc/network/interfaces ]; then
  sed -i '/iface ${iface}/,$d' /etc/network/interfaces
  cat << 'EOF' >> /etc/network/interfaces
${config.trim()}
EOF
  ifdown ${iface} >/dev/null 2>&1 || true
  ifup ${iface} >/dev/null 2>&1 || true
fi
`.trim();
  }

  if (['centos', 'rocky', 'alma'].includes(lowercaseDist)) {
    let nmconfig = `
[connection]
id=${iface}
type=ethernet
interface-name=${iface}
permissions=

[ethernet]
mac-address=${mac.toUpperCase()}

[ipv4]
`;
    if (ipv4 === 'dhcp') {
      nmconfig += 'method=auto\n';
    } else {
      nmconfig += `method=manual\naddresses1=${ipv4}\ngateway=${gateway || ''}\ndns=${dnsServers.join(';')};\n`;
    }
    
    return `
if [ -d /etc/NetworkManager/system-connections ]; then
  cat << 'EOF' > "/etc/NetworkManager/system-connections/${iface}.nmconnection"
${nmconfig.trim()}
EOF
  chmod 600 "/etc/NetworkManager/system-connections/${iface}.nmconnection"
  if command -v nmcli >/dev/null 2>&1; then
    nmcli connection reload || true
  fi
fi
if [ -d /etc/sysconfig/network-scripts ]; then
  cat << 'EOF' > "/etc/sysconfig/network-scripts/ifcfg-${iface}"
DEVICE=${iface}
HWADDR=${mac.toUpperCase()}
ONBOOT=yes
BOOTPROTO=${ipv4 === 'dhcp' ? 'dhcp' : 'static'}
IPADDR=${ipv4.split('/')[0]}
NETMASK=255.255.255.0
GATEWAY=${gateway || ''}
DNS1=${dnsServers[0] || '8.8.8.8'}
DNS2=${dnsServers[1] || '1.1.1.1'}
EOF
fi
`.trim();
  }

  if (lowercaseDist === 'arch') {
    let networkd = `
[Match]
MACAddress=${mac.toLowerCase()}

[Network]
`;
    if (ipv4 === 'dhcp') {
      networkd += 'DHCP=yes\n';
    } else {
      networkd += `Address=${ipv4}\nGateway=${gateway || ''}\n`;
      dnsServers.forEach((dns: string) => {
        networkd += `DNS=${dns}\n`;
      });
    }

    return `
cat << 'EOF' > /etc/systemd/network/20-wired.network
${networkd.trim()}
EOF
systemctl enable systemd-networkd || true
systemctl restart systemd-networkd || true
`.trim();
  }

  return '';
}
