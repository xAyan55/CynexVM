import { Router } from 'express';
import { db } from '../db';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { JobManager } from '../services/node/JobManager';
import { ConnectionManager } from '../services/node/ConnectionManager';
import { NotificationService } from '../services/notification/notificationService';

const router = Router();

function mapJobToTask(job: any): any {
  let payload: any = {};
  try {
    payload = typeof job.payload === 'string' ? JSON.parse(job.payload || '{}') : (job.payload || {});
  } catch (_) {}
  
  let currentStage = 'Running';
  let currentStep = 'Processing job...';
  
  if (job.status === 'queued') {
    currentStage = 'Queued';
    currentStep = 'Enqueued in job scheduler...';
  } else if (job.status === 'completed') {
    currentStage = 'Completed';
    currentStep = 'Job executed successfully!';
  } else if (job.status === 'failed') {
    currentStage = 'Failed';
    currentStep = job.error || 'Job failed';
  } else {
    if (job.type === 'deploy') {
      currentStage = job.progress < 30 ? 'Downloading image' : job.progress < 60 ? 'Creating container' : job.progress < 85 ? 'Booting' : 'Finalizing';
      currentStep = job.progress < 30 ? 'Downloading OS template registry...' : job.progress < 60 ? 'Provisioning LXC container limits...' : job.progress < 85 ? 'Starting container OS and configuring networks...' : 'Waiting for IP lease...';
    } else {
      currentStage = 'Executing';
      currentStep = `Executing ${job.type} container action...`;
    }
  }

  const logs = [];
  logs.push({
    timestamp: job.createdAt,
    level: 'info',
    message: `Job ${job.id} (${job.type}) registered.`
  });
  if (job.startedAt) {
    logs.push({
      timestamp: job.startedAt,
      level: 'info',
      message: `Execution started on node ${job.nodeId}.`
    });
  }
  if (job.progress > 0 && job.status === 'running') {
    logs.push({
      timestamp: job.updatedAt,
      level: 'info',
      message: `Progress: ${job.progress}%`
    });
  }
  if (job.status === 'completed') {
    logs.push({
      timestamp: job.finishedAt || job.updatedAt,
      level: 'info',
      message: 'Job completed successfully.'
    });
  } else if (job.status === 'failed') {
    logs.push({
      timestamp: job.finishedAt || job.updatedAt,
      level: 'error',
      message: `Job failed: ${job.error || 'Unknown error'}`
    });
  }

  return {
    id: job.id,
    name: `${job.type.toUpperCase()} Container ${payload.name || payload.containerName || ''}`,
    vmid: payload.vmid,
    instanceId: payload.instanceId,
    userId: payload.userId || 'admin',
    username: 'System',
    nodeName: job.nodeId === 'default-lxd-node' ? 'local' : 'remote',
    status: job.status === 'timed_out' ? 'failed' : job.status,
    progress: job.progress,
    currentStage,
    currentStep,
    durationMs: job.finishedAt && job.startedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : Date.now() - job.createdAt.getTime(),
    logs,
    failedReason: job.error || undefined,
    createdAt: job.createdAt
  };
}

/**
 * @route   GET /api/v1/instances/tasks
 * @desc    Lists background tasks mapped from NodeJobs
 */
router.get('/tasks', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const where: any = {};
    if (req.user.role !== 'Admin') {
      // Filter jobs where payload has owner's userId
      where.payload = { contains: req.user.id };
    }
    const jobs = await db.nodeJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    return res.status(200).json(jobs.map(mapJobToTask));
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
});

/**
 * @route   GET /api/v1/instances/tasks/:id
 * @desc    Gets detailed task log mapped from NodeJob
 */
router.get('/tasks/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const job = await db.nodeJob.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: 'Task not found' });
    
    const task = mapJobToTask(job);
    if (req.user.role !== 'Admin' && task.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.status(200).json(task);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve task details' });
  }
});

async function getInstance(id: string, userId?: string, isAdmin?: boolean) {
  const instance = await db.instance.findUnique({ where: { id }, include: { node: true } });
  if (!instance) return null;
  if (!isAdmin && userId && instance.userId !== userId) return null;
  return instance;
}

function jobAction(instance: any, type: string, extra: any = {}): Promise<any> {
  return JobManager.enqueue(instance.nodeId, type, {
    instanceId: instance.id,
    vmid: instance.vmid,
    name: instance.name,
    containerName: `cynex-${instance.vmid}`,
    ...extra
  });
}

router.get('/', authenticate, requirePermission('instance.read'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const where: any = {};
    if (req.user.role !== 'Admin') where.userId = req.user.id;
    const instances = await db.instance.findMany({
      where,
      include: { node: { select: { name: true, status: true } } }
    });
    return res.status(200).json(instances);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve instances' });
  }
});

router.get('/:id', authenticate, requirePermission('instance.read'), async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    
    try {
      const { lxcProvider } = require('../services/lxd/lxcProvider');
      const live = await lxcProvider.metrics(instance.node, instance);
      return res.status(200).json({
        ...instance,
        live
      });
    } catch (_) {
      return res.status(200).json(instance);
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch instance' });
  }
});

router.post('/', authenticate, requirePermission('instance.create'), async (req: AuthenticatedRequest, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  const { nodeId, userId, name, vmid, osTemplate, cpuCores, memoryMb, storageGb, hostname, password } = req.body;
  if (!name || !vmid || !osTemplate || !hostname) {
    return res.status(400).json({ error: 'Missing required fields: name, vmid, osTemplate, hostname' });
  }

  try {
    if (!nodeId || !ConnectionManager.isConnected(nodeId)) {
      return res.status(400).json({ error: 'Target node is not connected' });
    }

    const node = await db.node.findUnique({ where: { id: nodeId } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    const dbInstance = await db.instance.create({
      data: {
        nodeId, userId: userId || null,
        vmid: parseInt(vmid, 10), name, osTemplate,
        cpuCores: parseInt(cpuCores || '1', 10),
        memoryMb: parseInt(memoryMb || '512', 10),
        storageGb: parseInt(storageGb || '10', 10),
        hostname, password: password || null,
        status: 'deploying'
      }
    });

    const job = await jobAction(dbInstance, 'deploy', {
      osTemplate, cpuCores: parseInt(cpuCores || '1', 10),
      memoryMb: parseInt(memoryMb || '512', 10),
      storageGb: parseInt(storageGb || '10', 10),
      hostname, password, userId: userId || null
    });

    await NotificationService.notify(userId || null, 'deployment.started', { instance: name, node: node.name });

    return res.status(202).json({
      message: 'Deployment job created',
      instance: dbInstance,
      jobId: job.id,
      taskId: job.id
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to deploy' });
  }
});

router.post('/:id/start', authenticate, requirePermission('instance.start'), async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'start');
    return res.status(202).json({ message: 'Start job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/stop', authenticate, requirePermission('instance.stop'), async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'stop');
    return res.status(202).json({ message: 'Stop job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reboot', authenticate, requirePermission('instance.reboot'), async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'restart');
    return res.status(202).json({ message: 'Reboot job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/kill', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'force_stop');
    return res.status(202).json({ message: 'Kill job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/freeze', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'pause');
    return res.status(202).json({ message: 'Freeze job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/unfreeze', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'resume');
    return res.status(202).json({ message: 'Unfreeze job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reinstall', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'reinstall');
    return res.status(202).json({ message: 'Reinstall job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, requirePermission('instance.delete'), async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'delete');
    return res.status(202).json({ message: 'Delete job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/specs', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const { cpuCores, memoryMb, storageGb } = req.body;
    const updates: any = {};
    if (cpuCores) updates.cpuCores = parseInt(cpuCores, 10);
    if (memoryMb) updates.memoryMb = parseInt(memoryMb, 10);
    if (storageGb) updates.storageGb = parseInt(storageGb, 10);
    await db.instance.update({ where: { id: instance.id }, data: updates });
    if (cpuCores) await jobAction(instance, 'resize_cpu', { cores: parseInt(cpuCores, 10) });
    if (memoryMb) await jobAction(instance, 'resize_ram', { mb: parseInt(memoryMb, 10) });
    if (storageGb) await jobAction(instance, 'resize_disk', { gb: parseInt(storageGb, 10) });
    return res.status(200).json({ message: 'Specs update jobs created' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id/snapshots', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const snapshots = await db.snapshot.findMany({ where: { instanceId: req.params.id } });
    return res.status(200).json(snapshots);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

router.post('/:id/snapshots', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Snapshot name required' });
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'snapshot', { snapshotName: name, description });
    return res.status(202).json({ message: 'Snapshot job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/snapshots/:name/restore', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'snapshot_restore', { snapshotName: req.params.name });
    return res.status(202).json({ message: 'Restore job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/snapshots/:name', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'snapshot_delete', { snapshotName: req.params.name });
    return res.status(202).json({ message: 'Snapshot delete job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id/backups', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const backups = await db.backup.findMany({ where: { instanceId: req.params.id } });
    return res.status(200).json(backups);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch backups' });
  }
});

router.post('/:id/backups', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'backup', { backupName: req.body.name || `backup-${Date.now()}` });
    return res.status(202).json({ message: 'Backup job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/backups/:backupId/restore', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const job = await jobAction(instance, 'backup_restore', { backupId: req.params.backupId });
    return res.status(202).json({ message: 'Restore job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:id/password', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });
    const instance = await getInstance(req.params.id, req.user?.id, req.user?.role === 'Admin');
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    await db.instance.update({ where: { id: instance.id }, data: { password } });
    const job = await jobAction(instance, 'exec_command', { command: `echo "root:${password}" | chpasswd` });
    return res.status(202).json({ message: 'Password update job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:id/jobs', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const jobs = await JobManager.list(req.params.id, undefined, 50);
    return res.status(200).json(jobs);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.post('/:id/sync', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const JobManagerModule = require('../services/node/JobManager');
    const job = await JobManagerModule.default.enqueue(req.params.id, 'sync', {});
    return res.status(202).json({ message: 'Sync job created', jobId: job.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
