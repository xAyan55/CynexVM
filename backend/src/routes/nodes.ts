import { Router } from 'express';
import { db } from '../db';
import { authenticate, requirePermission } from '../middleware/auth';
import { CryptoService } from '../services/cryptoService';
import { LxdService } from '../services/lxdService';

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
 * @desc    Adds a new hypervisor node
 */
router.post('/', authenticate, requirePermission('node.create'), async (req, res) => {
  const { name, hostname, apiUrl, apiToken, sslFingerprint, cpuCores, memoryMb, storageGb } = req.body;
  if (!name || !hostname) {
    return res.status(400).json({ error: 'Name and Hostname are required' });
  }

  try {
    // Encrypt SSH credentials if provided
    const encryptedToken = apiToken ? CryptoService.encrypt(apiToken) : 'local-placeholder';

    // Save node configurations
    const node = await db.node.create({
      data: {
        name,
        hostname,
        apiUrl: apiUrl || '22', // Port field
        apiToken: encryptedToken,
        sslFingerprint: sslFingerprint || null,
        cpuCores: parseInt(cpuCores || '0', 10),
        memoryMb: parseInt(memoryMb || '0', 10),
        storageGb: parseInt(storageGb || '0', 10),
        status: 'online'
      }
    });

    // Write audit log
    await db.auditLog.create({
      data: {
        action: 'node.create',
        targetResourceId: node.id,
        targetResourceType: 'Node',
        details: `Node ${name} configured`,
        severity: 'info'
      }
    });

    return res.status(201).json(node);
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
  const { name, hostname, apiUrl, apiToken, sslFingerprint, cpuCores, memoryMb, storageGb, maintenanceMode } = req.body;

  try {
    const node = await db.node.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const updateData: any = {};
    if (name) updateData.name = name;
    if (hostname) updateData.hostname = hostname;
    if (apiUrl) updateData.apiUrl = apiUrl;
    if (sslFingerprint !== undefined) updateData.sslFingerprint = sslFingerprint;
    if (cpuCores) updateData.cpuCores = parseInt(cpuCores, 10);
    if (memoryMb) updateData.memoryMb = parseInt(memoryMb, 10);
    if (storageGb) updateData.storageGb = parseInt(storageGb, 10);
    if (maintenanceMode !== undefined) updateData.maintenanceMode = maintenanceMode;

    if (apiToken) {
      updateData.apiToken = CryptoService.encrypt(apiToken);
    }

    const updatedNode = await db.node.update({
      where: { id: req.params.id },
      data: updateData
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
 * @desc    Tests live connection to the local LXD container engine
 */
router.post('/:id/test', authenticate, requirePermission('node.write'), async (req, res) => {
  try {
    const node = await db.node.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const test = await LxdService.testConnection();

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

export default router;
