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

const router = Router();

/**
 * @route   GET /api/v1/instances/tasks
 * @desc    Lists background tasks
 */
router.get('/tasks', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const isAdmin = req.user.role === 'Admin';
  const list = TaskService.listTasks(req.user.id, isAdmin);
  return res.status(200).json(list);
});

/**
 * @route   GET /api/v1/instances/tasks/:id
 * @desc    Gets task log details
 */
router.get('/tasks/:id', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const task = TaskService.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  
  if (req.user.role !== 'Admin' && task.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return res.status(200).json(task);
});

/**
 * @route   GET /api/v1/instances
 * @desc    Lists all LXC instances (Admin gets all, Customer gets assigned only)
 */
router.get('/', authenticate, requirePermission('instance.read'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    let instances;
    if (req.user.role === 'Admin') {
      instances = await db.instance.findMany({
        include: {
          node: { select: { name: true } }
        }
      });
    } else {
      instances = await db.instance.findMany({
        where: { userId: req.user.id },
        include: {
          node: { select: { name: true } }
        }
      });
    }
    return res.status(200).json(instances);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve instances' });
  }
});

/**
 * @route   GET /api/v1/instances/:id
 * @desc    Retrieves status and details of a specific container
 */
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
      const liveStatus = await LxdContainerService.getInfo(instance.nodeId, instance.vmid);
      
      if (liveStatus.status && liveStatus.status !== instance.status) {
        await db.instance.update({
          where: { id: instance.id },
          data: { status: liveStatus.status }
        });
        instance.status = liveStatus.status;
      }

      return res.status(200).json({
        ...instance,
        live: {
          uptime: liveStatus.live.uptime,
          cpu: liveStatus.live.cpu,
          maxcpu: liveStatus.live.maxcpu,
          mem: liveStatus.live.mem,
          maxmem: liveStatus.live.maxmem,
          disk: liveStatus.live.disk,
          maxdisk: liveStatus.live.maxdisk,
          netin: liveStatus.live.netin,
          netout: liveStatus.live.netout
        }
      });
    } catch (lxdErr: any) {
      console.warn(`Could not fetch live status for VMID ${instance.vmid}:`, lxdErr.message);
      return res.status(200).json(instance);
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch instance details' });
  }
});

/**
 * @route   POST /api/v1/instances
 * @desc    Deploys a new LXC container (Background Deployment Queue - Admin Only)
 */
router.post('/', authenticate, requirePermission('instance.create'), async (req: AuthenticatedRequest, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Only administrators can deploy instances' });
  }

  const { nodeId, userId, name, vmid, osTemplate, cpuCores, memoryMb, storageGb, hostname, password, strategy } = req.body;
  
  if (!name || !vmid || !osTemplate || !hostname) {
    return res.status(400).json({ error: 'Missing deployment parameters' });
  }

  try {
    // 1. Quotas validation check
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

    // 2. Select node via Scheduler if none specified
    let targetNodeId = nodeId;
    if (!targetNodeId) {
      const selected = await NodeScheduler.selectNode((strategy as SchedulerStrategy) || 'least-cpu', {
        cpuCores: reqCpu,
        memoryMb: reqRam,
        storageGb: reqDisk
      });
      targetNodeId = selected;
    }

    const node = await db.node.findUnique({ where: { id: targetNodeId } });
    if (!node) return res.status(404).json({ error: 'Target node not found' });

    // 3. Verify VMID is not occupied in DB
    const existing = await db.instance.findFirst({
      where: { nodeId: targetNodeId, vmid: parseInt(vmid, 10) }
    });
    if (existing) {
      return res.status(400).json({ error: `VMID ${vmid} is already allocated` });
    }

    // Acquire instance creation lock
    const lockKey = `create:cynex-${vmid}`;
    if (!LockManager.acquire(lockKey, 'wizard_deploy')) {
      return res.status(409).json({ error: 'Another deploy task is currently locks this container slot' });
    }

    // Spawn task tracker
    const task = TaskService.createTask({
      name: `Deploy VPS ${name}`,
      vmid: parseInt(vmid, 10),
      userId: userId || null,
      username: req.user.username,
      nodeName: node.name
    });

    // Enqueue Deploy job in background worker queue
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
      lockKey
    });

    return res.status(202).json({
      message: 'VPS deployment background task enqueued.',
      taskId: task.id
    });
  } catch (err: any) {
    console.error('Deployment error:', err);
    return res.status(500).json({ error: err.message || 'Failed to queue container deployment' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/specs
 * @desc    Updates VPS resource specs (Admin Only)
 */
router.post('/:id/specs', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  const { cpuCores, memoryMb, storageGb } = req.body;
  const { id } = req.params;

  try {
    const instance = await db.instance.findUnique({
      where: { id },
      include: { node: true }
    });

    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    const containerName = `cynex-${instance.vmid}`;
    // Lock instance
    if (!LockManager.acquire(instance.id, 'specs_change')) {
      return res.status(409).json({ error: 'This instance is locked by another running task' });
    }

    // Update specs in database
    const updated = await db.instance.update({
      where: { id },
      data: {
        cpuCores: parseInt(cpuCores, 10),
        memoryMb: parseInt(memoryMb, 10),
        storageGb: parseInt(storageGb, 10)
      }
    });

    // Apply limits directly via LXD Rest API
    try {
      await LxdContainerService.setStatus(instance.nodeId, instance.vmid, 'stop', true);
      
      const patchData = {
        config: {
          'limits.cpu': String(cpuCores),
          'limits.memory': `${memoryMb}MB`
        },
        devices: {
          root: {
            path: '/',
            pool: 'default',
            type: 'disk',
            size: `${storageGb}GiB`
          }
        }
      };

      const { LxdClient } = require('../services/lxd/lxdClient');
      await LxdClient.request(instance.nodeId, `/1.0/instances/${containerName}`, 'PATCH', patchData);
      
      await LxdContainerService.setStatus(instance.nodeId, instance.vmid, 'start');
    } catch (err: any) {
      console.warn('LXD hardware limits application warning:', err.message);
    } finally {
      LockManager.release(instance.id, 'specs_change');
    }

    return res.status(200).json({ message: 'VPS hardware specifications updated successfully', instance: updated });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update VPS specifications' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/start
 * @desc    Starts the container
 */
router.post('/:id/start', authenticate, requirePermission('instance.start'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const instance = await db.instance.findUnique({ 
      where: { id: req.params.id }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!LockManager.acquire(instance.id, 'start')) {
      return res.status(409).json({ error: 'Resource locked' });
    }

    try {
      await LxdContainerService.setStatus(instance.nodeId, instance.vmid, 'start');
      await db.instance.update({
        where: { id: instance.id },
        data: { status: 'running' }
      });
    } finally {
      LockManager.release(instance.id, 'start');
    }

    return res.status(200).json({ message: 'Container boot command dispatched.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to start container' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/stop
 * @desc    Stops the container
 */
router.post('/:id/stop', authenticate, requirePermission('instance.stop'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const instance = await db.instance.findUnique({ 
      where: { id: req.params.id }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!LockManager.acquire(instance.id, 'stop')) {
      return res.status(409).json({ error: 'Resource locked' });
    }

    try {
      await LxdContainerService.setStatus(instance.nodeId, instance.vmid, 'stop');
      await db.instance.update({
        where: { id: instance.id },
        data: { status: 'stopped' }
      });
    } finally {
      LockManager.release(instance.id, 'stop');
    }

    return res.status(200).json({ message: 'Container stop command dispatched.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to stop container' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/reboot
 * @desc    Reboots the container
 */
router.post('/:id/reboot', authenticate, requirePermission('instance.reboot'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const instance = await db.instance.findUnique({ 
      where: { id: req.params.id }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!LockManager.acquire(instance.id, 'reboot')) {
      return res.status(409).json({ error: 'Resource locked' });
    }

    try {
      await LxdContainerService.setStatus(instance.nodeId, instance.vmid, 'restart');
    } finally {
      LockManager.release(instance.id, 'reboot');
    }

    return res.status(200).json({ message: 'Container reboot command dispatched.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to reboot container' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/kill
 * @desc    Forcefully stops the container
 */
router.post('/:id/kill', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const instance = await db.instance.findUnique({ 
      where: { id: req.params.id }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!LockManager.acquire(instance.id, 'kill')) {
      return res.status(409).json({ error: 'Resource locked' });
    }

    try {
      await LxdContainerService.setStatus(instance.nodeId, instance.vmid, 'stop', true);
      await db.instance.update({
        where: { id: instance.id },
        data: { status: 'stopped' }
      });
    } finally {
      LockManager.release(instance.id, 'kill');
    }

    return res.status(200).json({ message: 'Container forcefully killed.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to kill container' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/freeze
 * @desc    Freezes (pauses) the container
 */
router.post('/:id/freeze', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const instance = await db.instance.findUnique({ where: { id: req.params.id } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!LockManager.acquire(instance.id, 'freeze')) {
      return res.status(409).json({ error: 'Resource locked' });
    }

    try {
      await LxdContainerService.setStatus(instance.nodeId, instance.vmid, 'freeze');
      await db.instance.update({
        where: { id: instance.id },
        data: { status: 'frozen' }
      });
    } finally {
      LockManager.release(instance.id, 'freeze');
    }

    return res.status(200).json({ message: 'Container frozen successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to freeze container' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/unfreeze
 * @desc    Unfreezes (resumes) the container
 */
router.post('/:id/unfreeze', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const instance = await db.instance.findUnique({ where: { id: req.params.id } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!LockManager.acquire(instance.id, 'unfreeze')) {
      return res.status(409).json({ error: 'Resource locked' });
    }

    try {
      await LxdContainerService.setStatus(instance.nodeId, instance.vmid, 'unfreeze');
      await db.instance.update({
        where: { id: instance.id },
        data: { status: 'running' }
      });
    } finally {
      LockManager.release(instance.id, 'unfreeze');
    }

    return res.status(200).json({ message: 'Container unfrozen successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to unfreeze container' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/reinstall
 * @desc    Reinstalls the container operating system filesystem (Admin Only)
 */
router.post('/:id/reinstall', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }

  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

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

    return res.status(202).json({
      message: 'Container OS reinstallation enqueued.',
      taskId: task.id
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to enqueue reinstallation' });
  }
});

/**
 * @route   DELETE /api/v1/instances/:id
 * @desc    Destroys the container (Admin Only)
 */
router.delete('/:id', authenticate, requirePermission('instance.delete'), async (req: AuthenticatedRequest, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Only administrators can destroy instances' });
  }

  try {
    const instance = await db.instance.findUnique({ 
      where: { id: req.params.id },
      include: { node: true }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (!LockManager.acquire(instance.id, 'delete')) {
      return res.status(409).json({ error: 'Resource locked' });
    }

    try {
      await LxdContainerService.delete(instance.nodeId, instance.vmid);
      await db.instance.delete({ where: { id: instance.id } });

      await db.auditLog.create({
        data: {
          action: 'instance.delete',
          targetResourceId: instance.id,
          targetResourceType: 'Instance',
          details: `Deleted container ${instance.name}`,
          severity: 'warning'
        }
      });
    } finally {
      LockManager.release(instance.id, 'delete');
    }

    return res.status(200).json({ message: 'Container destroyed successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to destroy container' });
  }
});

// --- Register Background Workers ---
JobService.registerWorker('instance.deploy', async (job) => {
  const { taskId, nodeId, name, vmid, osTemplate, cpuCores, memoryMb, storageGb, hostname, password, lockKey } = job.data;
  
  try {
    TaskService.updateTask(taskId, {
      status: 'validating',
      progress: 10,
      currentStage: 'Validating',
      currentStep: 'Checking available node storage pool resources...',
      logMessage: 'Checking storage pool & bridge network allocations...'
    });

    const node = await db.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error('Target node not found');

    // Validate storage availability
    const fitsStorage = await LxdStorageService.hasAvailableCapacity(nodeId, 'default', storageGb);
    if (!fitsStorage) {
      throw new Error(`Deployment rejected: Insufficient storage capacity on storage pool 'default'`);
    }

    TaskService.updateTask(taskId, {
      progress: 30,
      currentStage: 'Downloading Image',
      currentStep: `Pulling OS image template: ${osTemplate}`,
      logMessage: 'Triggering image sync with canonical simplify registry...'
    });

    // Auto download image if missing
    try {
      await LxdImageService.downloadImage(nodeId, osTemplate.replace('images:', ''));
      TaskService.updateTask(taskId, { logMessage: 'Image found or pulled successfully.' });
    } catch (e: any) {
      console.warn('LXD Image download skipped/warning:', e.message);
    }

    TaskService.updateTask(taskId, {
      status: 'running',
      progress: 60,
      currentStage: 'Creating',
      currentStep: 'Provisioning container config limits & mountpoints...',
      logMessage: 'Executing LXD REST create specifications...'
    });

    // Create the container
    await LxdContainerService.create(nodeId, {
      vmid,
      ostemplate: osTemplate,
      hostname,
      cores: cpuCores,
      memory: memoryMb,
      diskSizeGb: storageGb,
      password
    });

    TaskService.updateTask(taskId, {
      progress: 85,
      currentStage: 'Booting',
      currentStep: 'Booting Linux OS and performing running health check...',
      logMessage: 'LXD container started successfully. Auditing status...'
    });

    // Verify container actually exists on host
    const info = await LxdContainerService.getInfo(nodeId, vmid);
    if (info.status !== 'running') {
      throw new Error(`LXC container cynex-${vmid} failed to start successfully (Status: ${info.status})`);
    }

    // Finally save metadata in database
    const instance = await db.instance.create({
      data: {
        nodeId,
        vmid,
        name,
        cpuCores,
        memoryMb,
        storageGb,
        osTemplate,
        hostname,
        status: 'running'
      }
    });

    TaskService.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      currentStage: 'Completed',
      currentStep: 'VPS successfully deployed!',
      logMessage: `VPS CynexVM-Instance metadata committed (ID: ${instance.id})`
    });

  } catch (err: any) {
    // Rollback container on host if created
    try {
      await LxdContainerService.delete(nodeId, vmid);
    } catch (_) {}

    TaskService.updateTask(taskId, {
      status: 'failed',
      failedReason: err.message,
      logMessage: `ROLLBACK TRIGGERED: ${err.message}`,
      logLevel: 'error'
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
      status: 'running',
      progress: 20,
      currentStage: 'Stopping',
      currentStep: 'Force stopping container OS...',
      logMessage: 'Sending stop request to container state...'
    });

    const instance = await db.instance.findUnique({ where: { id: instanceId }, include: { node: true } });
    if (!instance) throw new Error('Instance not found');

    await LxdContainerService.delete(instance.nodeId, instance.vmid);

    TaskService.updateTask(taskId, {
      progress: 60,
      currentStage: 'Recreating',
      currentStep: 'Re-initializing container layout filesystem...',
      logMessage: 'Deploying fresh OS template root filesystem...'
    });

    await LxdContainerService.create(instance.nodeId, {
      vmid: instance.vmid,
      ostemplate: instance.osTemplate,
      hostname: instance.hostname,
      cores: instance.cpuCores,
      memory: instance.memoryMb,
      diskSizeGb: instance.storageGb,
      password: instance.password || 'admin'
    });

    TaskService.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      currentStage: 'Completed',
      currentStep: 'OS reinstallation completed!',
      logMessage: 'Fresh container filesystem active. Uptime started.'
    });

  } catch (err: any) {
    TaskService.updateTask(taskId, {
      status: 'failed',
      failedReason: err.message,
      logMessage: `Reinstallation failed: ${err.message}`,
      logLevel: 'error'
    });
    throw err;
  } finally {
    LockManager.release(lockKey, 'reinstall');
  }
});

export default router;
