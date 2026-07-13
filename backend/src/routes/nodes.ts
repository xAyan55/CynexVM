import { Router } from 'express';
import { db } from '../db';
import { authenticate, requirePermission } from '../middleware/auth';
import { NodeAuthService } from '../services/node/AuthService';
import { ConnectionManager } from '../services/node/ConnectionManager';
import { MetricsConsumer } from '../services/node/MetricsConsumer';

const router = Router();

router.get('/', authenticate, requirePermission('node.read'), async (req, res) => {
  try {
    const nodes = await db.node.findMany({
      select: {
        id: true, name: true, hostname: true, apiUrl: true,
        cpuCores: true, memoryMb: true, storageGb: true,
        status: true, latency: true, version: true, agentVersion: true,
        osName: true, kernel: true, uptime: true, containerCount: true,
        lastHeartbeat: true, lastSeen: true, connectedAt: true,
        clusterName: true, maintenanceMode: true, createdAt: true,
        _count: { select: { jobs: { where: { status: 'running' } } } }
      }
    });

    const enriched = nodes.map(n => ({
      ...n,
      connected: ConnectionManager.isConnected(n.id),
      jobsRunning: (n as any)._count?.jobs || 0,
      jobsQueued: 0,
      _count: undefined
    }));

    return res.status(200).json(enriched);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve nodes' });
  }
});

router.get('/:id', authenticate, requirePermission('node.read'), async (req, res) => {
  try {
    const node = await db.node.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { jobs: true, instances: true } }
      }
    });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const recentMetrics = await MetricsConsumer.getRecent(node.id, 60);

    return res.status(200).json({
      ...node,
      connected: ConnectionManager.isConnected(node.id),
      metrics: recentMetrics
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve node' });
  }
});

router.post('/', authenticate, requirePermission('node.create'), async (req, res) => {
  const { name, hostname, cpuCores, memoryMb, storageGb } = req.body;
  if (!name || !hostname) {
    return res.status(400).json({ error: 'Name and hostname are required' });
  }

  try {
    const node = await db.node.create({
      data: {
        name, hostname, apiUrl: '',
        cpuCores: parseInt(cpuCores || '0', 10),
        memoryMb: parseInt(memoryMb || '0', 10),
        storageGb: parseInt(storageGb || '0', 10),
        status: 'offline'
      }
    });

    const { token, raw } = await NodeAuthService.generateToken(node.id);

    await db.auditLog.create({
      data: {
        action: 'node.create',
        targetResourceId: node.id,
        targetResourceType: 'Node',
        details: `Node ${name} registered`,
        severity: 'info'
      }
    });

    return res.status(201).json({
      node: {
        id: node.id, name: node.name, hostname: node.hostname,
        status: node.status, cpuCores: node.cpuCores,
        memoryMb: node.memoryMb, storageGb: node.storageGb
      },
      registration: {
        panelUrl: `${req.protocol}://${req.get('host')}/ws/node`,
        nodeId: node.id,
        token: raw,
        tokenFull: token
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to register node' });
  }
});

router.put('/:id', authenticate, requirePermission('node.write'), async (req, res) => {
  const { name, hostname, cpuCores, memoryMb, storageGb, maintenanceMode } = req.body;

  try {
    const node = await db.node.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const updateData: any = {};
    if (name) updateData.name = name;
    if (hostname) updateData.hostname = hostname;
    if (cpuCores) updateData.cpuCores = parseInt(cpuCores, 10);
    if (memoryMb) updateData.memoryMb = parseInt(memoryMb, 10);
    if (storageGb) updateData.storageGb = parseInt(storageGb, 10);
    if (maintenanceMode !== undefined) updateData.maintenanceMode = maintenanceMode;

    const updatedNode = await db.node.update({
      where: { id: req.params.id },
      data: updateData
    });

    return res.status(200).json(updatedNode);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update node' });
  }
});

router.delete('/:id', authenticate, requirePermission('node.delete'), async (req, res) => {
  try {
    const node = await db.node.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    await NodeAuthService.revokeAllTokens(node.id);
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

router.post('/:id/tokens', authenticate, requirePermission('node.write'), async (req, res) => {
  try {
    const node = await db.node.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const { token, raw } = await NodeAuthService.generateToken(node.id, req.body.name || 'primary');
    return res.status(201).json({ token, raw, name: req.body.name || 'primary' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to generate token' });
  }
});

router.delete('/:id/tokens/:tokenName', authenticate, requirePermission('node.write'), async (req, res) => {
  try {
    await NodeAuthService.revokeToken(req.params.id, req.params.tokenName);
    return res.status(200).json({ message: 'Token revoked' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to revoke token' });
  }
});

router.get('/:id/jobs', authenticate, requirePermission('node.read'), async (req, res) => {
  try {
    const { JobManager } = require('../services/node/JobManager');
    const jobs = await JobManager.list(req.params.id, undefined, 100);
    return res.status(200).json(jobs);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

export default router;
