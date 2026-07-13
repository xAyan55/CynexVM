import { Router } from 'express';
import { db } from '../db';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { LxdContainerService } from '../services/lxd/lxdContainerService';
import { LxdImageService } from '../services/lxd/lxdImageService';
import { LxdStorageService } from '../services/lxd/lxdStorageService';
import { NodeScheduler, SchedulerStrategy } from '../services/scheduler';
import { LockManager } from '../services/lockManager';
import { TaskService } from '../services/taskService';
import { JobService } from '../services/jobService';
import { NotificationService } from '../services/notification/notificationService';
import { lxcProvider } from '../services/lxd/lxcProvider';
import { LxdClient } from '../services/lxd/lxdClient';
import { NodeClient } from '../services/lxd/nodeClient';

const router = Router();

router.get('/tasks', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const isAdmin = req.user.role === 'Admin';
  const list = TaskService.listTasks(req.user.id, isAdmin);
  return res.status(200).json(list);
});

router.get('/tasks/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const task = TaskService.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (req.user.role !== 'Admin' && task.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return res.status(200).json(task);
});

router.get('/', authenticate, requirePermission('instance.read'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    let instances;
    if (req.user.role === 'Admin') {
      instances = await db.instance.findMany({
        include: { node: { select: { name: true } } }
      });
    } else {
      instances = await db.instance.findMany({
        where: { userId: req.user.id },
        include: { node: { select: { name: true } } }
      });
    }
    return res.status(200).json(instances);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve instances' });
  }
});

router.get('/:id', authenticate, requirePermission('instance.read'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const instance = await db.instance.findUnique({
      where: { id: req.params.id },
      include: { node: true }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this instance' });
    }
    try {
      const metrics = await lxcProvider.metrics(instance.node, instance);
      if (metrics.status && metrics.status !== instance.status && !['rebooting', 'starting'].includes(metrics.status)) {
        await db.instance.update({
          where: { id: instance.id },
          data: { status: metrics.status }
        });
        instance.status = metrics.status;
      }
      return res.status(200).json({ ...instance, live: metrics });
    } catch (lxdErr: any) {
      console.warn(`Could not fetch live status for container ${instance.vmid}:`, lxdErr.message);
      return res.status(200).json(instance);
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch instance details' });
  }
});

router.post('/', authenticate, requirePermission('instance.create'), async (req: AuthenticatedRequest, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Only administrators can deploy instances' });
  }
  const { nodeId, userId, name, vmid, osTemplate, cpuCores, memoryMb, storageGb, hostname, password, strategy, disks, networkInterfaces } = req.body;
  if (!name || !vmid || !osTemplate || !hostname) {
    return res.status(400).json({ error: 'Missing deployment parameters' });
  }
  try {
    const userInstances = await db.instance.findMany({ where: { userId: userId || undefined } });
    const activeCpu = userInstances.reduce((acc, inst) => acc + inst.cpuCores, 0);
    const activeRam = userInstances.reduce((acc, inst) => acc + inst.memoryMb, 0);
    const activeDisk = userInstances.reduce((acc, inst) => acc + inst.storageGb, 0);
    const maxCpuQuota = 8;
    const maxRamQuota = 16384;
    const maxDiskQuota = 200;
    const reqCpu = parseInt(cpuCores || '1', 10);
    const reqRam = parseInt(memoryMb || '512', 10);
    const reqDisk = parseInt(storageGb || '10', 10);
    if (activeCpu + reqCpu > maxCpuQuota || activeRam + reqRam > maxRamQuota || activeDisk + reqDisk > maxDiskQuota) {
      return res.status(403).json({ error: `Quota limit exceeded. Allocated resource caps: Max ${maxCpuQuota} Cores, ${maxRamQuota} MB RAM, ${maxDiskQuota} GB Storage` });
    }
    let targetNodeId = nodeId;
    if (!targetNodeId) {
      const selected = await NodeScheduler.selectNode((strategy as SchedulerStrategy) || 'least-cpu', {
        cpuCores: reqCpu, memoryMb: reqRam, storageGb: reqDisk
      });
      targetNodeId = selected;
    }
    const node = await db.node.findUnique({ where: { id: targetNodeId } });
    if (!node) return res.status(404).json({ error: 'Target node not found' });
    if (!node.supportsLxc) {
      return res.status(400).json({ error: 'Selected node does not support LXC containers' });
    }
    const existing = await db.instance.findFirst({
      where: { nodeId: targetNodeId, vmid: parseInt(vmid, 10) }
    });
    if (existing) {
      return res.status(400).json({ error: `VMID ${vmid} is already allocated` });
    }
    const lockKey = `create:cynex-${vmid}`;
    if (!LockManager.acquire(lockKey, 'wizard_deploy')) {
      return res.status(409).json({ error: 'Another deploy task is currently locks this container slot' });
    }
    const task = TaskService.createTask({
      name: `Deploy Container ${name}`,
      vmid: parseInt(vmid, 10),
      userId: userId || null,
      username: req.user.username,
      nodeName: node.name
    });
    await JobService.enqueue('instance.deploy', {
      taskId: task.id,
      nodeId: targetNodeId,
      userId: userId || null,
      name,
      vmid: parseInt(vmid, 10),
      osTemplate,
      cpuCores: reqCpu,
      memoryMb: reqRam,
      storageGb: reqDisk,
      hostname,
      password,
      disks,
      networkInterfaces,
      lockKey
    });
    await NotificationService.notify(userId || null, 'deployment.started', { instance: name, node: node.name });
    return res.status(202).json({ message: 'Container deployment background task enqueued.', taskId: task.id });
  } catch (err: any) {
    console.error('Deployment error:', err);
    return res.status(500).json({ error: err.message || 'Failed to queue container deployment' });
  }
});

router.post('/:id/specs', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  const { cpuCores, memoryMb, storageGb } = req.body;
  const { id } = req.params;
  try {
    const instance = await db.instance.findUnique({ where: { id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (!LockManager.acquire(instance.id, 'specs_change')) {
      return res.status(409).json({ error: 'This instance is locked by another running task' });
    }
    const updated = await db.instance.update({
      where: { id },
      data: { cpuCores: parseInt(cpuCores, 10), memoryMb: parseInt(memoryMb, 10), storageGb: parseInt(storageGb, 10) }
    });
    try {
      if (cpuCores) await lxcProvider.resizeCPU(instance.node, instance, parseInt(cpuCores, 10));
      if (memoryMb) await lxcProvider.resizeMemory(instance.node, instance, parseInt(memoryMb, 10));
      if (storageGb) await lxcProvider.resizeDisk(instance.node, instance, 'root', parseInt(storageGb, 10));
    } catch (err: any) {
      console.warn('Live resource limits application warning:', err.message);
    } finally {
      LockManager.release(instance.id, 'specs_change');
    }
    return res.status(200).json({ message: 'Container hardware specifications updated successfully', instance: updated });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update container specifications' });
  }
});

router.post('/:id/start', authenticate, requirePermission('instance.start'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!LockManager.acquire(instance.id, 'start')) {
      return res.status(409).json({ error: 'Resource locked' });
    }
    try {
      await lxcProvider.start(instance.node, instance);
      await db.instance.update({ where: { id: instance.id }, data: { status: 'running' } });
      await NotificationService.notify(instance.userId || null, 'instance.started', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'start');
    }
    return res.status(200).json({ message: 'Boot command dispatched successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to start instance' });
  }
});

router.post('/:id/stop', authenticate, requirePermission('instance.stop'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!LockManager.acquire(instance.id, 'stop')) {
      return res.status(409).json({ error: 'Resource locked' });
    }
    try {
      await lxcProvider.stop(instance.node, instance, false);
      await db.instance.update({ where: { id: instance.id }, data: { status: 'stopped' } });
      await NotificationService.notify(instance.userId || null, 'instance.stopped', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'stop');
    }
    return res.status(200).json({ message: 'Stop command dispatched successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to stop instance' });
  }
});

router.post('/:id/reboot', authenticate, requirePermission('instance.reboot'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!LockManager.acquire(instance.id, 'reboot')) {
      return res.status(409).json({ error: 'Resource locked' });
    }
    try {
      await lxcProvider.restart(instance.node, instance);
      await db.instance.update({ where: { id: instance.id }, data: { status: 'rebooting' } });
      await NotificationService.notify(instance.userId || null, 'instance.rebooted', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'reboot');
    }
    return res.status(200).json({ message: 'Reboot command dispatched successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to reboot instance' });
  }
});

router.post('/:id/kill', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!LockManager.acquire(instance.id, 'kill')) {
      return res.status(409).json({ error: 'Resource locked' });
    }
    try {
      await lxcProvider.kill(instance.node, instance);
      await db.instance.update({ where: { id: instance.id }, data: { status: 'stopped' } });
      await NotificationService.notify(instance.userId || null, 'instance.killed', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'kill');
    }
    return res.status(200).json({ message: 'Instance forcefully killed.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to kill instance' });
  }
});

router.post('/:id/freeze', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!LockManager.acquire(instance.id, 'freeze')) {
      return res.status(409).json({ error: 'Resource locked' });
    }
    try {
      await lxcProvider.pause(instance.node, instance);
      await db.instance.update({ where: { id: instance.id }, data: { status: 'frozen' } });
      await NotificationService.notify(instance.userId || null, 'instance.suspended', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'freeze');
    }
    return res.status(200).json({ message: 'Instance frozen successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to freeze instance' });
  }
});

router.post('/:id/unfreeze', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!LockManager.acquire(instance.id, 'unfreeze')) {
      return res.status(409).json({ error: 'Resource locked' });
    }
    try {
      await lxcProvider.resume(instance.node, instance);
      await db.instance.update({ where: { id: instance.id }, data: { status: 'running' } });
      await NotificationService.notify(instance.userId || null, 'instance.started', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'unfreeze');
    }
    return res.status(200).json({ message: 'Instance unfrozen successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to unfreeze instance' });
  }
});

router.post('/:id/reinstall', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (req.user?.role !== 'Admin' && instance.userId !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this instance' });
    }
    if (!LockManager.acquire(instance.id, 'reinstall')) {
      return res.status(409).json({ error: 'Resource locked by another running task' });
    }
    const task = TaskService.createTask({
      name: `Reinstall OS ${instance.name}`,
      vmid: instance.vmid,
      userId: instance.userId || undefined,
      username: req.user.username,
      nodeName: instance.node.name
    });
    await JobService.enqueue('instance.reinstall', {
      taskId: task.id,
      instanceId: instance.id,
      lockKey: instance.id
    });
    return res.status(202).json({ message: 'OS reinstallation enqueued.', taskId: task.id });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to enqueue reinstallation' });
  }
});

router.delete('/:id', authenticate, requirePermission('instance.delete'), async (req: AuthenticatedRequest, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Only administrators can destroy instances' });
  }
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (!LockManager.acquire(instance.id, 'delete')) {
      return res.status(409).json({ error: 'Resource locked' });
    }
    try {
      await lxcProvider.delete(instance.node, instance);
      await db.instance.delete({ where: { id: instance.id } });
      await NotificationService.notify(instance.userId || null, 'instance.deleted', { instance: instance.name });
      await db.auditLog.create({
        data: {
          action: 'instance.delete',
          targetResourceId: instance.id,
          targetResourceType: 'Instance',
          details: `Deleted instance ${instance.name}`,
          severity: 'warning'
        }
      });
    } finally {
      LockManager.release(instance.id, 'delete');
    }
    return res.status(200).json({ message: 'Instance destroyed successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to destroy instance' });
  }
});

router.post('/:id/password', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required' });
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this instance' });
    }
    const containerName = `cynex-${instance.vmid}`;
    try {
      await LxdClient.request(instance.nodeId, `/1.0/instances/${containerName}/exec`, 'POST', {
        command: ['sh', '-c', `echo "root:${password}" | chpasswd`],
        environment: {},
        'wait-for-variables': true,
        record: false
      });
      await db.instance.update({ where: { id: instance.id }, data: { password } });
      return res.status(200).json({ message: 'Root password updated successfully.' });
    } catch (err: any) {
      return res.status(400).json({ error: 'Failed to update password inside container: ' + err.message });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update root password' });
  }
});

router.get('/:id/snapshots', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const snapshots = await lxcProvider.listSnapshots(instance.node, instance);
    return res.status(200).json(snapshots);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch snapshots' });
  }
});

router.post('/:id/snapshots', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Snapshot name is required' });
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    await lxcProvider.snapshot(instance.node, instance, name, description);
    const snapshot = await db.snapshot.create({
      data: { instanceId: instance.id, name, description: description || 'Manual snapshot checkpoint', status: 'active' }
    });
    await NotificationService.notify(instance.userId || null, 'snapshot.created', { instance: instance.name, snapshot: name });
    return res.status(201).json(snapshot);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create snapshot' });
  }
});

router.post('/:id/snapshots/:name/restore', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    await lxcProvider.restore(instance.node, instance, req.params.name);
    await NotificationService.notify(instance.userId || null, 'snapshot.restored', { instance: instance.name, snapshot: req.params.name });
    return res.status(200).json({ message: 'Snapshot successfully restored' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to restore snapshot' });
  }
});

router.delete('/:id/snapshots/:name', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    await lxcProvider.deleteSnapshot(instance.node, instance, req.params.name);
    await db.snapshot.deleteMany({ where: { instanceId: instance.id, name: req.params.name } });
    await NotificationService.notify(instance.userId || null, 'snapshot.deleted', { instance: instance.name, snapshot: req.params.name });
    return res.status(200).json({ message: 'Snapshot successfully deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete snapshot' });
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
    const { name } = req.body;
    const backupName = name || `backup-${Date.now()}`;
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const backupResult = await lxcProvider.createBackup(instance.node, instance, backupName, null);
    let storageProvider = await db.storageProvider.findFirst();
    if (!storageProvider) {
      storageProvider = await db.storageProvider.create({
        data: { name: 'Default Local Storage', type: 'local', secretId: 'default-local-secret' }
      });
    }
    const backup = await db.backup.create({
      data: {
        instanceId: instance.id,
        storageProviderId: storageProvider.id,
        name: backupName,
        sizeBytes: 1024 * 1024 * 50,
        status: 'active',
        type: 'incremental',
        path: backupResult.path || '',
      }
    });
    return res.status(201).json(backup);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to trigger backup' });
  }
});

router.post('/:id/backups/:backupId/restore', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    const backup = await db.backup.findUnique({ where: { id: req.params.backupId } });
    if (!instance || !backup) return res.status(404).json({ error: 'Instance or Backup not found' });
    await lxcProvider.restoreBackup(instance.node, instance, backup.path || '', null);
    return res.status(200).json({ message: 'Backup successfully restored' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to restore backup' });
  }
});

router.delete('/:id/backups/:backupId', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const backup = await db.backup.findUnique({ where: { id: req.params.backupId }, include: { instance: { include: { node: true } } } });
    if (!backup) return res.status(404).json({ error: 'Backup not found' });
    await NodeClient.executeCommand(backup.instance.nodeId, `rm -f ${backup.path}`);
    await db.backup.delete({ where: { id: req.params.backupId } });
    return res.status(200).json({ message: 'Backup successfully deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete backup' });
  }
});

router.get('/:id/firewall', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const rules = await db.firewallRule.findMany({ where: { instanceId: req.params.id } });
    return res.status(200).json(rules);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch firewall rules' });
  }
});

router.post('/:id/firewall', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { direction, action, protocol, port, sourceIp } = req.body;
    const rule = await db.firewallRule.create({
      data: { instanceId: req.params.id, direction, action, protocol, port: String(port), sourceIp: sourceIp || '0.0.0.0/0' }
    });
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (instance) {
      const chain = direction === 'inbound' ? 'FORWARD' : 'FORWARD';
      const actionFlag = action === 'ACCEPT' ? 'ACCEPT' : 'DROP';
      const portFilter = port ? `--dport ${port}` : '';
      const srcFilter = sourceIp ? `-s ${sourceIp}` : '';
      await NodeClient.executeCommand(instance.nodeId, `iptables -A ${chain} -p ${protocol} ${srcFilter} ${portFilter} -j ${actionFlag} || true`);
    }
    return res.status(201).json(rule);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create firewall rule' });
  }
});

router.delete('/:id/firewall/:ruleId', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const rule = await db.firewallRule.findUnique({ where: { id: req.params.ruleId } });
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (instance) {
      const chain = rule.direction === 'inbound' ? 'FORWARD' : 'FORWARD';
      const actionFlag = rule.action === 'ACCEPT' ? 'ACCEPT' : 'DROP';
      const portFilter = rule.port ? `--dport ${rule.port}` : '';
      const srcFilter = rule.sourceIp ? `-s ${rule.sourceIp}` : '';
      await NodeClient.executeCommand(instance.nodeId, `iptables -D ${chain} -p ${rule.protocol} ${srcFilter} ${portFilter} -j ${actionFlag} || true`);
    }
    await db.firewallRule.delete({ where: { id: req.params.ruleId } });
    return res.status(200).json({ message: 'Firewall rule deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete firewall rule' });
  }
});

router.post('/:id/resize', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { cores, memoryMb, diskSizeGb } = req.body;
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (cores) {
      await lxcProvider.resizeCPU(instance.node, instance, cores);
      await db.instance.update({ where: { id: instance.id }, data: { cpuCores: cores } });
    }
    if (memoryMb) {
      await lxcProvider.resizeMemory(instance.node, instance, memoryMb);
      await db.instance.update({ where: { id: instance.id }, data: { memoryMb } });
    }
    if (diskSizeGb) {
      await lxcProvider.resizeDisk(instance.node, instance, 'disk0', diskSizeGb);
      await db.instance.update({ where: { id: instance.id }, data: { storageGb: diskSizeGb } });
    }
    return res.status(200).json({ message: 'Instance resized successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to resize instance' });
  }
});

router.get('/:id/metrics', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    const metrics = await lxcProvider.metrics(instance.node, instance);
    return res.status(200).json(metrics);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch metrics' });
  }
});

// --- Background Workers ---

JobService.registerWorker('instance.deploy', async (job) => {
  const { taskId, nodeId, name, vmid, osTemplate, cpuCores, memoryMb, storageGb, hostname, password, disks, networkInterfaces, lockKey } = job.data;
  try {
    TaskService.updateTask(taskId, {
      status: 'validating', progress: 10, currentStage: 'Validating',
      currentStep: 'Validating node capabilities...',
      logMessage: 'Verifying CPU, storage, and networking layers...'
    });
    const node = await db.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error('Target node not found');
    TaskService.updateTask(taskId, {
      progress: 30, currentStage: 'Downloading Image',
      currentStep: `Syncing template: ${osTemplate}`,
      logMessage: 'Preparing base operating system...'
    });
    await lxcProvider.create(node, { vmid, name, cpuCores, memoryMb, storageGb, hostname, password, osTemplate }, job.data);
    TaskService.updateTask(taskId, {
      progress: 85, currentStage: 'Booting',
      currentStep: 'Starting instance and awaiting live status...',
      logMessage: 'Boot call succeeded. Verifying power state...'
    });
    const state = await lxcProvider.powerState(node, { vmid });
    if (state !== 'running') {
      throw new Error(`Instance failed to boot successfully (Status: ${state})`);
    }
    const instance = await db.instance.create({
      data: {
        nodeId, vmid, name, cpuCores, memoryMb, storageGb, osTemplate, hostname, password,
        status: 'running',
        ipAddress: 'dhcp',
      }
    });
    await NotificationService.notify(job.data.userId || null, 'instance.created', { instance: name, instanceId: instance.id });
    await NotificationService.notify(job.data.userId || null, 'deployment.completed', { instance: name, instanceId: instance.id });
    TaskService.updateTask(taskId, {
      status: 'completed', progress: 100, currentStage: 'Completed',
      currentStep: 'Container successfully deployed!',
      logMessage: `Container metadata committed (ID: ${instance.id})`
    });
  } catch (err: any) {
    try {
      const node = await db.node.findUnique({ where: { id: nodeId } });
      if (node) {
        await lxcProvider.delete(node, { vmid });
      }
    } catch (_) {}
    await NotificationService.notify(job.data.userId || null, 'deployment.failed', { instance: name, error: err.message });
    TaskService.updateTask(taskId, {
      status: 'failed', failedReason: err.message,
      logMessage: `ROLLBACK TRIGGERED: ${err.message}`, logLevel: 'error'
    });
    throw err;
  } finally {
    LockManager.release(lockKey, 'wizard_deploy');
  }
});

JobService.registerWorker('instance.reinstall', async (job) => {
  const { taskId, instanceId, lockKey } = job.data;
  try {
    TaskService.updateTask(taskId, {
      status: 'running', progress: 20, currentStage: 'Stopping',
      currentStep: 'Tearing down old filesystem...',
      logMessage: 'Removing instance files on node...'
    });
    const instance = await db.instance.findUnique({ where: { id: instanceId }, include: { node: true } });
    if (!instance) throw new Error('Instance not found');
    await lxcProvider.reinstall(instance.node, instance, instance);
    await NotificationService.notify(instance.userId || null, 'deployment.completed', { instance: instance.name, instanceId: instance.id });
    TaskService.updateTask(taskId, {
      status: 'completed', progress: 100, currentStage: 'Completed',
      currentStep: 'OS reinstallation completed!',
      logMessage: 'Fresh operating system active.'
    });
  } catch (err: any) {
    try {
      const inst = await db.instance.findUnique({ where: { id: instanceId } });
      await NotificationService.notify(inst?.userId || null, 'deployment.failed', { instance: inst?.name || 'Unknown', error: err.message });
    } catch (_) {}
    TaskService.updateTask(taskId, {
      status: 'failed', failedReason: err.message,
      logMessage: `Reinstallation failed: ${err.message}`, logLevel: 'error'
    });
    throw err;
  } finally {
    LockManager.release(lockKey, 'reinstall');
  }
});

function generateMac(): string {
  return '52:54:00:' + [
    Math.floor(Math.random() * 255).toString(16).padStart(2, '0'),
    Math.floor(Math.random() * 255).toString(16).padStart(2, '0'),
    Math.floor(Math.random() * 255).toString(16).padStart(2, '0')
  ].join(':');
}

export default router;
