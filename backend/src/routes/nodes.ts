import { Router } from 'express';
import { db } from '../db';
import { authenticate, requirePermission } from '../middleware/auth';
import { CryptoService } from '../services/cryptoService';
import { LxdService } from '../services/lxdService';
import { FirmwareDetector } from '../services/virtualization/firmwareDetector';
import crypto from 'crypto';

const router = Router();

/**
 * @route   GET /api/v1/nodes
 * @desc    Lists all configured hypervisor nodes
 */
router.get('/', authenticate, requirePermission('node.read'), async (req, res) => {
  try {
    const nodes = await db.node.findMany({
      select: {
        id: true,
        name: true,
        hostname: true,
        apiUrl: true,
        cpuCores: true,
        memoryMb: true,
        storageGb: true,
        status: true,
        latency: true,
        version: true,
        clusterName: true,
        maintenanceMode: true,
        supportsQemu: true,
        createdAt: true,
      }
    });
    return res.status(200).json(nodes);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve nodes' });
  }
});

/**
 * @route   GET /api/v1/nodes/:id
 * @desc    Retrieves detail view for a specific node
 */
router.get('/:id', authenticate, requirePermission('node.read'), async (req, res) => {
  try {
    const node = await db.node.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        hostname: true,
        apiUrl: true,
        sslFingerprint: true,
        cpuCores: true,
        memoryMb: true,
        storageGb: true,
        status: true,
        latency: true,
        version: true,
        clusterName: true,
        maintenanceMode: true
      }
    });

    if (!node) return res.status(404).json({ error: 'Node not found' });
    return res.status(200).json(node);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve node' });
  }
});

/**
 * @route   POST /api/v1/nodes
 * @desc    Adds a new hypervisor node (generates daemon config.json)
 */
router.post('/', authenticate, requirePermission('node.create'), async (req, res) => {
  const { name, hostname, location, description, cpuCores, memoryMb, storageGb } = req.body;
  if (!name || !hostname) {
    return res.status(400).json({ error: 'Name and Hostname (CF Tunnel URL) are required' });
  }

  try {
    // Generate secure random node daemon token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const encryptedToken = CryptoService.encrypt(rawToken);

    // Save node configurations
    const node = await db.node.create({
      data: {
        name,
        hostname,
        apiUrl: location || 'Local', // Mapping location to apiUrl
        apiToken: encryptedToken,
        clusterName: description || 'LXD Daemon node', // Mapping description to clusterName
        cpuCores: parseInt(cpuCores || '0', 10),
        memoryMb: parseInt(memoryMb || '0', 10),
        storageGb: parseInt(storageGb || '0', 10),
        status: 'offline'
      }
    });

    // Write audit log
    await db.auditLog.create({
      data: {
        action: 'node.create',
        targetResourceId: node.id,
        targetResourceType: 'Node',
        details: `Node ${name} registered. Tunnel URL: ${hostname}`,
        severity: 'info'
      }
    });

    // Generate config.json format
    const configJson = {
      nodeId: node.id,
      token: rawToken,
      port: 5050
    };

    return res.status(201).json({
      node,
      configJson
    });
  } catch (err: any) {
    console.error('Node create error:', err);
    return res.status(500).json({ error: 'Failed to register node' });
  }
});

/**
 * @route   PUT /api/v1/nodes/:id
 * @desc    Updates configuration for a hypervisor node
 */
router.put('/:id', authenticate, requirePermission('node.write'), async (req, res) => {
  const { name, hostname, location, description, cpuCores, memoryMb, storageGb, maintenanceMode, supportsQemu } = req.body;

  try {
    const node = await db.node.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const updateData: any = {};
    if (name) updateData.name = name;
    if (hostname) updateData.hostname = hostname;
    if (location) updateData.apiUrl = location;
    if (description) updateData.clusterName = description;
    if (cpuCores) updateData.cpuCores = parseInt(cpuCores, 10);
    if (memoryMb) updateData.memoryMb = parseInt(memoryMb, 10);
    if (storageGb) updateData.storageGb = parseInt(storageGb, 10);
    if (maintenanceMode !== undefined) updateData.maintenanceMode = maintenanceMode;
    if (supportsQemu !== undefined) updateData.supportsQemu = supportsQemu;

    const updatedNode = await db.node.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        hostname: true,
        apiUrl: true,
        cpuCores: true,
        memoryMb: true,
        storageGb: true,
        status: true,
        version: true,
        clusterName: true,
        maintenanceMode: true,
        supportsQemu: true,
      }
    });

    return res.status(200).json(updatedNode);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update node configuration' });
  }
});

/**
 * @route   DELETE /api/v1/nodes/:id
 * @desc    Deletes a node configuration
 */
router.delete('/:id', authenticate, requirePermission('node.delete'), async (req, res) => {
  try {
    const node = await db.node.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    await db.node.delete({ where: { id: req.params.id } });

    await db.auditLog.create({
      data: {
        action: 'node.delete',
        targetResourceId: req.params.id,
        targetResourceType: 'Node',
        details: `Deleted node ${node.name}`,
        severity: 'warning'
      }
    });

    return res.status(200).json({ message: 'Node deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete node' });
  }
});

/**
 * @route   POST /api/v1/nodes/:id/test
 * @desc    Tests live connection to the local/remote LXD container engine
 */
router.post('/:id/test', authenticate, requirePermission('node.write'), async (req, res) => {
  try {
    const node = await db.node.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const test = await LxdService.testConnection(node);

    if (test.success) {
      await db.node.update({
        where: { id: node.id },
        data: { status: 'online', version: test.version }
      });
      return res.status(200).json({ success: true, version: test.version });
    } else {
      await db.node.update({
        where: { id: node.id },
        data: { status: 'offline' }
      });
      return res.status(400).json({ success: false, message: test.message });
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'Verification script execution failed' });
  }
});

/**
 * @route   GET /api/v1/nodes/:id/validate
 * @desc    Runs comprehensive host validation including firmware detection
 */
router.get('/:id/validate', authenticate, requirePermission('node.read'), async (req, res) => {
  try {
    const node = await db.node.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const validation = await FirmwareDetector.validateNode(node.id);
    return res.status(200).json(validation);
  } catch (err: any) {
    return res.status(500).json({ error: 'Node validation failed: ' + err.message });
  }
});

/**
 * @route   GET /api/v1/nodes/:id/diagnostics
 * @desc    Run hypervisor capability checks (Intel/AMD virt flags, KVM, bridge, tools, dhcp, nat)
 */
router.get('/:id/diagnostics', authenticate, requirePermission('node.read'), async (req, res) => {
  const { NodeClient } = require('../services/virtualization/nodeClient');
  try {
    const node = await db.node.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const checks: any = {
      cpu_virtualization: false,
      kvm: false,
      libvirt: false,
      ovmf: false,
      storage_pool: false,
      bridge: false,
      dhcp_dns: false,
      virt_customize: false,
      qemu_img: false,
      virsh: false,
      ip_forwarding: false,
      nat_enabled: false,
      available_bridges: [],
      available_networks: [],
      dhcp_leases_count: 0
    };

    // 1. CPU Virtualization
    const cpuVirt = await NodeClient.executeCommand(node.id, "egrep -c '(vmx|svm)' /proc/cpuinfo 2>/dev/null || echo 0");
    checks.cpu_virtualization = parseInt(cpuVirt.stdout || '0', 10) > 0;

    // 2. KVM Device
    const kvmDev = await NodeClient.executeCommand(node.id, "test -c /dev/kvm && test -w /dev/kvm && echo yes || echo no");
    checks.kvm = kvmDev.stdout.includes('yes');

    // 3. Libvirt Service
    const libvirtSvc = await NodeClient.executeCommand(node.id, "systemctl is-active libvirtd 2>/dev/null || echo inactive");
    checks.libvirt = libvirtSvc.stdout.trim() === 'active';

    // 4. OVMF UEFI Firmware
    const ovmfFiles = await NodeClient.executeCommand(node.id, "ls /usr/share/OVMF/OVMF_CODE.fd /usr/share/qemu/OVMF.fd 2>/dev/null | wc -l");
    checks.ovmf = parseInt(ovmfFiles.stdout || '0', 10) > 0;

    // 5. Default Storage Pool
    const poolInfo = await NodeClient.executeCommand(node.id, "virsh pool-info default 2>/dev/null && echo yes || echo no");
    checks.storage_pool = poolInfo.stdout.includes('yes');

    // 6. Bridge Interface
    const bridgeInfo = await NodeClient.executeCommand(node.id, "ip link show lxdbr0 2>/dev/null || ip link show virbr0 2>/dev/null || echo no");
    checks.bridge = !bridgeInfo.stdout.includes('no') && bridgeInfo.stdout.trim().length > 0;

    // 7. DHCP/DNS Service
    const dhcpInfo = await NodeClient.executeCommand(node.id, "systemctl is-active dnsmasq 2>/dev/null || systemctl is-active systemd-resolved 2>/dev/null || echo inactive");
    checks.dhcp_dns = dhcpInfo.stdout.trim() === 'active';

    // 8. virt-customize
    const virtCustomize = await NodeClient.executeCommand(node.id, "command -v virt-customize && echo yes || echo no");
    checks.virt_customize = virtCustomize.stdout.includes('yes');

    // 9. qemu-img
    const qemuImg = await NodeClient.executeCommand(node.id, "command -v qemu-img && echo yes || echo no");
    checks.qemu_img = qemuImg.stdout.includes('yes');

    // 10. virsh
    const virsh = await NodeClient.executeCommand(node.id, "command -v virsh && echo yes || echo no");
    checks.virsh = virsh.stdout.includes('yes');

    // 11. IP Forwarding Check
    const forwardVal = await NodeClient.executeCommand(node.id, "cat /proc/sys/net/ipv4/ip_forward 2>/dev/null || echo 0");
    checks.ip_forwarding = parseInt(forwardVal.stdout.trim(), 10) === 1;

    // 12. NAT Enable Check
    const natCheck = await NodeClient.executeCommand(node.id, "iptables -t nat -S 2>/dev/null | grep -E 'MASQUERADE|POSTROUTING' || echo no");
    checks.nat_enabled = !natCheck.stdout.includes('no') && natCheck.stdout.trim().length > 0;

    // 13. Discover Bridges
    const bridgesRes = await NodeClient.executeCommand(node.id, "ip -o link show | awk -F': ' '$2 ~ /br|virbr|lxdbr/ {print $2}' || true");
    if (bridgesRes.exitCode === 0) {
      checks.available_bridges = bridgesRes.stdout.trim().split('\n').filter(Boolean);
    }

    // 14. Discover Libvirt Networks
    const netsRes = await NodeClient.executeCommand(node.id, "virsh net-list --name 2>/dev/null || true");
    if (netsRes.exitCode === 0) {
      checks.available_networks = netsRes.stdout.trim().split('\n').filter(Boolean);
    }

    // 15. Active Leases Count
    const leasesRes = await NodeClient.executeCommand(node.id, "cat /var/lib/libvirt/dnsmasq/*.leases /var/lib/misc/dnsmasq.leases /var/lib/dnsmasq/*.leases 2>/dev/null | wc -l || echo 0");
    checks.dhcp_leases_count = parseInt(leasesRes.stdout.trim(), 10);

    return res.status(200).json(checks);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to run node diagnostics' });
  }
});

export default router;
