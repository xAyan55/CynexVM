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
import { VirtualizationProviderFactory } from '../services/virtualization/provider';
import { FirmwareDetector } from '../services/virtualization/firmwareDetector';

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
      const provider = VirtualizationProviderFactory.getProvider(instance.type);
      const metrics = await provider.metrics(instance.node, instance);
      
      if (metrics.status && metrics.status !== instance.status && !['rebooting', 'starting'].includes(metrics.status)) {
        await db.instance.update({
          where: { id: instance.id },
          data: { status: metrics.status }
        });
        instance.status = metrics.status;
      }

      return res.status(200).json({
        ...instance,
        live: metrics
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

  const { nodeId, userId, name, vmid, osTemplate, cpuCores, memoryMb, storageGb, hostname, password, strategy, type = 'LXC', vmConfig, cloudInit, disks, networkInterfaces } = req.body;
  
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

    // Validate node capability
    if (type === 'LXC' && !node.supportsLxc) {
      return res.status(400).json({ error: `Selected node does not support LXC Containers` });
    }
    if ((type === 'QEMU' || type === 'KVM') && !node.supportsQemu) {
      return res.status(400).json({ error: `Selected node does not support QEMU/KVM Virtual Machines` });
    }

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
      type,
      vmConfig,
      cloudInit,
      disks,
      networkInterfaces,
      lockKey
    });

    // Notify of deployment start
    await NotificationService.notify(userId || null, 'deployment.started', { instance: name, node: node.name });

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

    // Apply limits via virtualization provider
    try {
      const provider = VirtualizationProviderFactory.getProvider(instance.type);
      if (cpuCores) await provider.resizeCPU(instance.node, instance, parseInt(cpuCores, 10));
      if (memoryMb) await provider.resizeMemory(instance.node, instance, parseInt(memoryMb, 10));
      if (storageGb) await provider.resizeDisk(instance.node, instance, 'root', parseInt(storageGb, 10));
    } catch (err: any) {
      console.warn('Live hardware limits application warning:', err.message);
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
 * @desc    Starts the instance
 */
router.post('/:id/start', authenticate, requirePermission('instance.start'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const instance = await db.instance.findUnique({ 
      where: { id: req.params.id },
      include: { node: true }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!LockManager.acquire(instance.id, 'start')) {
      return res.status(409).json({ error: 'Resource locked' });
    }

    try {
      const provider = VirtualizationProviderFactory.getProvider(instance.type);
      await provider.start(instance.node, instance);
      
      await db.instance.update({
        where: { id: instance.id },
        data: { status: 'running' }
      });

      // Trigger start notification
      await NotificationService.notify(instance.userId || null, 'instance.started', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'start');
    }

    return res.status(200).json({ message: 'Boot command dispatched successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to start instance' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/stop
 * @desc    Stops the instance
 */
router.post('/:id/stop', authenticate, requirePermission('instance.stop'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const instance = await db.instance.findUnique({ 
      where: { id: req.params.id },
      include: { node: true }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!LockManager.acquire(instance.id, 'stop')) {
      return res.status(409).json({ error: 'Resource locked' });
    }

    try {
      const provider = VirtualizationProviderFactory.getProvider(instance.type);
      await provider.stop(instance.node, instance, false);
      
      await db.instance.update({
        where: { id: instance.id },
        data: { status: 'stopped' }
      });

      // Trigger stop notification
      await NotificationService.notify(instance.userId || null, 'instance.stopped', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'stop');
    }

    return res.status(200).json({ message: 'Stop command dispatched successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to stop instance' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/reboot
 * @desc    Reboots the instance
 */
router.post('/:id/reboot', authenticate, requirePermission('instance.reboot'), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const instance = await db.instance.findUnique({ 
      where: { id: req.params.id },
      include: { node: true }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!LockManager.acquire(instance.id, 'reboot')) {
      return res.status(409).json({ error: 'Resource locked' });
    }

    try {
      const provider = VirtualizationProviderFactory.getProvider(instance.type);
      await provider.restart(instance.node, instance);

      // Set transitional state — metrics() will resolve to starting/running
      await db.instance.update({
        where: { id: instance.id },
        data: { status: 'rebooting' }
      });

      // Trigger reboot notification
      await NotificationService.notify(instance.userId || null, 'instance.rebooted', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'reboot');
    }

    return res.status(200).json({ message: 'Reboot command dispatched successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to reboot instance' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/kill
 * @desc    Forcefully stops the instance
 */
router.post('/:id/kill', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const instance = await db.instance.findUnique({ 
      where: { id: req.params.id },
      include: { node: true }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!LockManager.acquire(instance.id, 'kill')) {
      return res.status(409).json({ error: 'Resource locked' });
    }

    try {
      const provider = VirtualizationProviderFactory.getProvider(instance.type);
      await provider.kill(instance.node, instance);
      await db.instance.update({
        where: { id: instance.id },
        data: { status: 'stopped' }
      });

      // Trigger force kill notification
      await NotificationService.notify(instance.userId || null, 'instance.killed', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'kill');
    }

    return res.status(200).json({ message: 'Instance forcefully killed.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to kill instance' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/freeze
 * @desc    Freezes (pauses) the instance
 */
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
      const provider = VirtualizationProviderFactory.getProvider(instance.type);
      await provider.pause(instance.node, instance);
      await db.instance.update({
        where: { id: instance.id },
        data: { status: 'frozen' }
      });

      // Trigger suspend/freeze notification
      await NotificationService.notify(instance.userId || null, 'instance.suspended', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'freeze');
    }

    return res.status(200).json({ message: 'Instance frozen successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to freeze instance' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/unfreeze
 * @desc    Unfreezes (resumes) the instance
 */
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
      const provider = VirtualizationProviderFactory.getProvider(instance.type);
      await provider.resume(instance.node, instance);
      await db.instance.update({
        where: { id: instance.id },
        data: { status: 'running' }
      });

      // Trigger start/unfreeze notification
      await NotificationService.notify(instance.userId || null, 'instance.started', { instance: instance.name, instanceId: instance.id });
    } finally {
      LockManager.release(instance.id, 'unfreeze');
    }

    return res.status(200).json({ message: 'Instance unfrozen successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to unfreeze instance' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/reinstall
 * @desc    Reinstalls the instance operating system filesystem (Owner or Admin)
 */
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

    return res.status(202).json({
      message: 'OS reinstallation enqueued.',
      taskId: task.id
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to enqueue reinstallation' });
  }
});

/**
 * @route   DELETE /api/v1/instances/:id
 * @desc    Destroys the instance (Admin Only)
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
      const provider = VirtualizationProviderFactory.getProvider(instance.type);
      await provider.delete(instance.node, instance);
      
      await db.instance.delete({ where: { id: instance.id } });

      // Trigger delete notification
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

/**
 * @route   POST /api/v1/instances/:id/password
 * @desc    Changes root password of the instance (Owner or Admin)
 */
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
      if (instance.type === 'LXC') {
        const { LxdClient } = require('../services/lxd/lxdClient');
        await LxdClient.request(
          instance.nodeId,
          `/1.0/instances/${containerName}/exec`,
          'POST',
          {
            command: ['sh', '-c', `echo "root:${password}" | chpasswd`],
            environment: {},
            'wait-for-variables': true,
            record: false
          }
        );
      } else if (instance.type === 'KVM' || instance.type === 'QEMU') {
        const { NodeClient } = require('../services/virtualization/nodeClient');

        // Tier 1: Try qemu-guest-agent (requires agent running inside guest)
        const pingRes = await NodeClient.executeCommand(
          instance.nodeId,
          `virsh qemu-agent-command ${containerName} '{"execute":"guest-ping"}'`
        );

        if (pingRes.exitCode === 0) {
          // Guest agent is responding — use guest-exec to change password
          const cmd = `virsh qemu-agent-command ${containerName} '{"execute":"guest-exec","arguments":{"path":"/bin/sh","arg":["-c","echo \\"root:${password}\\" | chpasswd"],"capture-output":true}}'`;
          const execRes = await NodeClient.executeCommand(instance.nodeId, cmd);

          try {
            const parsed = JSON.parse(execRes.stdout);
            const pid = parsed?.return?.pid;
            if (pid) {
              await new Promise(r => setTimeout(r, 1000));
              const statusCmd = `virsh qemu-agent-command ${containerName} '{"execute":"guest-exec-status","arguments":{"pid":${pid}}}'`;
              const statusRes = await NodeClient.executeCommand(instance.nodeId, statusCmd);
              const status = JSON.parse(statusRes.stdout);
              if (status?.return?.exitcode !== 0 && status?.return?.exitcode !== undefined) {
                const errOut = status?.return?.['err-data'] ? Buffer.from(status.return['err-data'], 'base64').toString() : 'unknown error';
                return res.status(400).json({ error: 'Failed to set password inside guest: ' + errOut });
              }
            }
          } catch (_) {}
        } else {
          // Tier 2: Guest agent not available — try virt-customize (offline disk modification)
          // This requires libguestfs-tools on the node and VM to be stopped
          const diskPath = `/var/lib/libvirt/images/${containerName}_disk0.qcow2`;

          // Check if virt-customize is available
          const checkVirt = await NodeClient.executeCommand(instance.nodeId, 'command -v virt-customize && echo yes || echo no');
          if (checkVirt.stdout.includes('yes')) {
            // Stop VM before modifying disk
            await NodeClient.executeCommand(instance.nodeId, `virsh destroy ${containerName} 2>/dev/null; virsh shutdown ${containerName} 2>/dev/null; sleep 2`);
            
            const customizeRes = await NodeClient.executeCommand(
              instance.nodeId,
              `virt-customize -a ${diskPath} --root-password password:${password} 2>&1`
            );
            
            if (customizeRes.exitCode !== 0) {
              // Try guestfish as fallback
              const gfishRes = await NodeClient.executeCommand(
                instance.nodeId,
                `guestfish -a ${diskPath} -i sh 'echo "root:${password}" | chpasswd' 2>&1 || guestfish -a ${diskPath} -i passwd-root '${password}' 2>&1`
              );
              if (gfishRes.exitCode !== 0) {
                return res.status(400).json({
                  error: `Cannot change password: qemu-guest-agent is not running inside the VM, and offline disk modification failed. To fix: sudo apt install libguestfs-tools on the node, or install qemu-guest-agent inside the VM.`
                });
              }
            }
            
            // Start VM back up
            await NodeClient.executeCommand(instance.nodeId, `virsh start ${containerName} 2>/dev/null`);
          } else {
            // Tier 3: Neither agent nor virt-customize available — use cloud-init re-injection
            // Generate a fresh cloud-init ISO with the new password and re-attach
            const userData = `#cloud-config\nssh_pwauth: True\ndisable_root: false\nchpasswd:\n  list: |\n    root:${password}\n  expire: False\n`;
            const metaData = `instance-id: ${containerName}-reset-${Date.now()}\nlocal-hostname: ${instance.hostname || instance.name}\n`;
            
            await NodeClient.executeCommand(instance.nodeId, `mkdir -p /tmp/cloudinit-reset-${instance.vmid}`);
            await NodeClient.executeCommand(instance.nodeId, `echo "${Buffer.from(userData).toString('base64')}" | base64 -d > /tmp/cloudinit-reset-${instance.vmid}/user-data`);
            await NodeClient.executeCommand(instance.nodeId, `echo "${Buffer.from(metaData).toString('base64')}" | base64 -d > /tmp/cloudinit-reset-${instance.vmid}/meta-data`);
            
            const isoPath = `/var/lib/libvirt/images/${containerName}_reset.iso`;
            await NodeClient.executeCommand(
              instance.nodeId,
              `genisoimage -output ${isoPath} -volid cidata -joliet -rock /tmp/cloudinit-reset-${instance.vmid}/user-data /tmp/cloudinit-reset-${instance.vmid}/meta-data 2>/dev/null`
            );
            
            if (pingRes.exitCode === 0) {
              // Agent exists but exec failed — attach ISO and reboot via agent
              await NodeClient.executeCommand(instance.nodeId, `virsh attach-disk ${containerName} ${isoPath} sdb --device cdrom --config 2>/dev/null`);
              await NodeClient.executeCommand(instance.nodeId, `virsh qemu-agent-command ${containerName} '{"execute":"guest-shutdown","arguments":{"mode":"reboot"}}' 2>/dev/null`);
            } else {
              // No agent at all — attach ISO and force reboot
              await NodeClient.executeCommand(instance.nodeId, `virsh attach-disk ${containerName} ${isoPath} sdb --device cdrom --config 2>/dev/null`);
              await NodeClient.executeCommand(instance.nodeId, `virsh reboot ${containerName} 2>/dev/null`);
            }
            
            // Cleanup temp files
            await NodeClient.executeCommand(instance.nodeId, `rm -rf /tmp/cloudinit-reset-${instance.vmid}`);
          }
        }

        // Mark as rebooting — metrics() will transition to starting/running via guest agent check
        await db.instance.update({
          where: { id: instance.id },
          data: { status: 'rebooting' }
        });
      }

      // Update password in local database
      await db.instance.update({
        where: { id: instance.id },
        data: { password }
      });

      return res.status(200).json({ message: 'Root password updated successfully.' });
    } catch (err: any) {
      return res.status(400).json({ error: 'Failed to update password inside VPS: ' + err.message });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update root password' });
  }
});

/**
 * @route   GET /api/v1/instances/:id/snapshots
 * @desc    Lists snapshots of an instance
 */
router.get('/:id/snapshots', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    const provider = VirtualizationProviderFactory.getProvider(instance.type);
    const snapshots = await provider.listSnapshots(instance.node, instance);
    return res.status(200).json(snapshots);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch snapshots' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/snapshots
 * @desc    Creates snapshot
 */
router.post('/:id/snapshots', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Snapshot name is required' });

    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    const provider = VirtualizationProviderFactory.getProvider(instance.type);
    await provider.snapshot(instance.node, instance, name, description);

    // Write to DB
    const snapshot = await db.snapshot.create({
      data: {
        instanceId: instance.id,
        name,
        description: description || 'Manual snapshot checkpoint',
        status: 'active',
      }
    });

    await NotificationService.notify(instance.userId || null, 'snapshot.created', { instance: instance.name, snapshot: name });

    return res.status(201).json(snapshot);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create snapshot' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/snapshots/:name/restore
 * @desc    Restores snapshot
 */
router.post('/:id/snapshots/:name/restore', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    const provider = VirtualizationProviderFactory.getProvider(instance.type);
    await provider.restore(instance.node, instance, req.params.name);

    await NotificationService.notify(instance.userId || null, 'snapshot.restored', { instance: instance.name, snapshot: req.params.name });

    return res.status(200).json({ message: 'Snapshot successfully restored' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to restore snapshot' });
  }
});

/**
 * @route   DELETE /api/v1/instances/:id/snapshots/:name
 * @desc    Deletes snapshot
 */
router.delete('/:id/snapshots/:name', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    const provider = VirtualizationProviderFactory.getProvider(instance.type);
    await provider.deleteSnapshot(instance.node, instance, req.params.name);

    // Delete DB record if exists
    await db.snapshot.deleteMany({
      where: { instanceId: instance.id, name: req.params.name }
    });

    await NotificationService.notify(instance.userId || null, 'snapshot.deleted', { instance: instance.name, snapshot: req.params.name });

    return res.status(200).json({ message: 'Snapshot successfully deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete snapshot' });
  }
});

/**
 * @route   GET /api/v1/instances/:id/backups
 * @desc    Lists backups
 */
router.get('/:id/backups', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const backups = await db.backup.findMany({ where: { instanceId: req.params.id } });
    return res.status(200).json(backups);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch backups' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/backups
 * @desc    Triggers a backup
 */
router.post('/:id/backups', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { name } = req.body;
    const backupName = name || `backup-${Date.now()}`;

    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    const provider = VirtualizationProviderFactory.getProvider(instance.type);
    const backupResult = await provider.createBackup(instance.node, instance, backupName, null);

    // Look up or create a default StorageProvider record to satisfy database schema foreign key relation
    let storageProvider = await db.storageProvider.findFirst();
    if (!storageProvider) {
      storageProvider = await db.storageProvider.create({
        data: {
          name: 'Default Local Storage',
          type: 'local',
          secretId: 'default-local-secret'
        }
      });
    }

    // Save to DB
    const backup = await db.backup.create({
      data: {
        instanceId: instance.id,
        storageProviderId: storageProvider.id,
        name: backupName,
        sizeBytes: 1024 * 1024 * 50, // default placeholder size
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

/**
 * @route   POST /api/v1/instances/:id/backups/:backupId/restore
 * @desc    Restores a backup
 */
router.post('/:id/backups/:backupId/restore', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    const backup = await db.backup.findUnique({ where: { id: req.params.backupId } });
    if (!instance || !backup) return res.status(404).json({ error: 'Instance or Backup not found' });

    const provider = VirtualizationProviderFactory.getProvider(instance.type);
    await provider.restoreBackup(instance.node, instance, backup.path || '', null);

    return res.status(200).json({ message: 'Backup successfully restored' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to restore backup' });
  }
});

/**
 * @route   DELETE /api/v1/instances/:id/backups/:backupId
 * @desc    Deletes a backup
 */
router.delete('/:id/backups/:backupId', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const backup = await db.backup.findUnique({ where: { id: req.params.backupId }, include: { instance: { include: { node: true } } } });
    if (!backup) return res.status(404).json({ error: 'Backup not found' });

    // Remove block file on node
    const { NodeClient } = require('../services/virtualization/nodeClient');
    await NodeClient.executeCommand(backup.instance.nodeId, `rm -f ${backup.path}`);

    await db.backup.delete({ where: { id: req.params.backupId } });
    return res.status(200).json({ message: 'Backup successfully deleted' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete backup' });
  }
});

/**
 * @route   GET /api/v1/instances/:id/firewall
 * @desc    Gets firewall rules
 */
router.get('/:id/firewall', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const rules = await db.firewallRule.findMany({ where: { instanceId: req.params.id } });
    return res.status(200).json(rules);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch firewall rules' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/firewall
 * @desc    Adds firewall rule
 */
router.post('/:id/firewall', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { direction, action, protocol, port, sourceIp } = req.body;
    
    // Save rule in DB
    const rule = await db.firewallRule.create({
      data: {
        instanceId: req.params.id,
        direction,
        action,
        protocol,
        port: String(port),
        sourceIp: sourceIp || '0.0.0.0/0',
      }
    });

    // For real operations, if it's LXC or KVM, write network filter rules on host using iptables/nftables
    // This is optional but we can run iptables commands on node host!
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (instance) {
      const { NodeClient } = require('../services/virtualization/nodeClient');
      const chain = direction === 'inbound' ? 'FORWARD' : 'FORWARD';
      const actionFlag = action === 'ACCEPT' ? 'ACCEPT' : 'DROP';
      const portFilter = port ? `--dport ${port}` : '';
      const srcFilter = sourceIp ? `-s ${sourceIp}` : '';
      
      // Real security filter commands:
      await NodeClient.executeCommand(
        instance.nodeId,
        `iptables -A ${chain} -p ${protocol} ${srcFilter} ${portFilter} -j ${actionFlag} || true`
      );
    }

    return res.status(201).json(rule);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create firewall rule' });
  }
});

/**
 * @route   DELETE /api/v1/instances/:id/firewall/:ruleId
 * @desc    Removes firewall rule
 */
router.delete('/:id/firewall/:ruleId', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const rule = await db.firewallRule.findUnique({ where: { id: req.params.ruleId } });
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    // Tear down firewall rule on host
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (instance) {
      const { NodeClient } = require('../services/virtualization/nodeClient');
      const chain = rule.direction === 'inbound' ? 'FORWARD' : 'FORWARD';
      const actionFlag = rule.action === 'ACCEPT' ? 'ACCEPT' : 'DROP';
      const portFilter = rule.port ? `--dport ${rule.port}` : '';
      const srcFilter = rule.sourceIp ? `-s ${rule.sourceIp}` : '';
      await NodeClient.executeCommand(
        instance.nodeId,
        `iptables -D ${chain} -p ${rule.protocol} ${srcFilter} ${portFilter} -j ${actionFlag} || true`
      );
    }

    await db.firewallRule.delete({ where: { id: req.params.ruleId } });
    return res.status(200).json({ message: 'Firewall rule deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete firewall rule' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/mount-iso
 * @desc    Mounts CDROM ISO (QEMU/KVM VMs only)
 */
router.post('/:id/mount-iso', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { isoPath } = req.body;
    if (!isoPath) return res.status(400).json({ error: 'ISO path is required' });

    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (instance.type === 'LXC') return res.status(400).json({ error: 'LXC containers do not support ISO mount' });

    const provider = VirtualizationProviderFactory.getProvider(instance.type);
    await provider.attachISO(instance.node, instance, isoPath);

    return res.status(200).json({ message: 'ISO mounted successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to mount ISO' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/eject-iso
 * @desc    Ejects CDROM ISO (QEMU/KVM VMs only)
 */
router.post('/:id/eject-iso', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });
    if (instance.type === 'LXC') return res.status(400).json({ error: 'LXC containers do not support ISO mount' });

    const provider = VirtualizationProviderFactory.getProvider(instance.type);
    await provider.detachISO(instance.node, instance);

    return res.status(200).json({ message: 'ISO ejected successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to eject ISO' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/resize
 * @desc    Resizes instance resources live
 */
router.post('/:id/resize', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const { cores, memoryMb, diskSizeGb } = req.body;
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    const provider = VirtualizationProviderFactory.getProvider(instance.type);

    if (cores) {
      await provider.resizeCPU(instance.node, instance, cores);
      await db.instance.update({ where: { id: instance.id }, data: { cpuCores: cores } });
    }
    if (memoryMb) {
      await provider.resizeMemory(instance.node, instance, memoryMb);
      await db.instance.update({ where: { id: instance.id }, data: { memoryMb } });
    }
    if (diskSizeGb) {
      await provider.resizeDisk(instance.node, instance, 'disk0', diskSizeGb);
      await db.instance.update({ where: { id: instance.id }, data: { storageGb: diskSizeGb } });
    }

    return res.status(200).json({ message: 'Instance resized successfully.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to resize instance' });
  }
});

/**
 * @route   GET /api/v1/instances/:id/metrics
 * @desc    Retrieves live metrics
 */
router.get('/:id/metrics', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const instance = await db.instance.findUnique({ where: { id: req.params.id }, include: { node: true } });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    const provider = VirtualizationProviderFactory.getProvider(instance.type);
    const metrics = await provider.metrics(instance.node, instance);
    return res.status(200).json(metrics);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch metrics' });
  }
});

// --- Register Background Workers ---
JobService.registerWorker('instance.deploy', async (job) => {
  const { taskId, nodeId, name, vmid, osTemplate, cpuCores, memoryMb, storageGb, hostname, password, type = 'LXC', vmConfig, cloudInit, disks, networkInterfaces, lockKey } = job.data;
  
  try {
    TaskService.updateTask(taskId, {
      status: 'validating',
      progress: 10,
      currentStage: 'Validating',
      currentStep: 'Validating hypervisor capabilities and nodes...',
      logMessage: 'Verifying CPU, storage, and networking layers...'
    });

    const node = await db.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error('Target node not found');

    TaskService.updateTask(taskId, {
      progress: 30,
      currentStage: 'Downloading Image',
      currentStep: `Syncing template/cloud image: ${osTemplate}`,
      logMessage: 'Preparing base operating system virtual disks...'
    });

    const provider = VirtualizationProviderFactory.getProvider(type);
    
    TaskService.updateTask(taskId, {
      status: 'running',
      progress: 60,
      currentStage: 'Creating',
      currentStep: 'Defining hardware descriptors and allocating storage...',
      logMessage: 'Orchestrating hypervisor setup instructions...'
    });

    // Validate firmware for KVM/QEMU deployments
    if (type === 'KVM' || type === 'QEMU') {
      TaskService.updateTask(taskId, {
        progress: 40,
        currentStage: 'Validating',
        currentStep: 'Checking firmware availability...',
        logMessage: 'Detecting available UEFI/BIOS firmware on node...'
      });
      await FirmwareDetector.validateFirmware(nodeId, !!vmConfig?.uefi, vmConfig?.autoFallback !== false);
    }

    // Deploy container or VM via provider
    await provider.create(node, { vmid, name, cpuCores, memoryMb, storageGb, hostname, password, osTemplate }, job.data);

    TaskService.updateTask(taskId, {
      progress: 85,
      currentStage: 'Booting',
      currentStep: 'Starting instance and awaiting live status...',
      logMessage: 'Hypervisor boot call succeeded. Verifying power state...'
    });

    const state = await provider.powerState(node, { vmid });
    if (state !== 'running') {
      throw new Error(`Instance failed to boot successfully (Status: ${state})`);
    }

    // Save metadata in database with all configuration records
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
        password,
        status: 'running',
        type,
        vmConfig: type !== 'LXC' ? {
          create: {
            cpuThreads: vmConfig?.cpuThreads || 1,
            cpuSockets: vmConfig?.cpuSockets || 1,
            cpuModel: vmConfig?.cpuModel || 'host',
            cpuMode: vmConfig?.cpuMode || 'host-passthrough',
            uefi: vmConfig?.uefi === true,
            legacyBios: !!vmConfig?.legacyBios,
            tpm: !!vmConfig?.tpm,
            secureBoot: !!vmConfig?.secureBoot,
            machineType: vmConfig?.machineType || 'q35',
            graphicsType: vmConfig?.graphicsType || 'vnc',
            gpuType: vmConfig?.gpuType || 'vga',
            guestAgent: vmConfig?.guestAgent !== false,
            smbiosManufacturer: vmConfig?.smbiosManufacturer || 'CynexVM',
            smbiosProductName: vmConfig?.smbiosProductName || 'Virtual Machine',
            smbiosSerialNumber: vmConfig?.smbiosSerialNumber || `cynex-${vmid}`,
            smbiosSku: vmConfig?.smbiosSku || 'SKU-001',
            smbiosFamily: vmConfig?.smbiosFamily || 'Compute',
            smbiosUuid: vmConfig?.smbiosUuid || instanceIdLikeUuid(),
          }
        } : undefined,
        cloudInit: cloudInit?.enabled ? {
          create: {
            enabled: true,
            userData: cloudInit.userData || '',
            metaData: cloudInit.metaData || '',
            networkConfig: cloudInit.networkConfig || '',
          }
        } : undefined,
        disks: type !== 'LXC' ? {
          create: disks?.map((d: any) => ({
            name: d.name,
            sizeGb: d.sizeGb,
            type: d.type || 'virtio',
            cacheMode: d.cacheMode || 'none',
            discard: d.discard !== false,
            isIso: !!d.isIso,
            isoPath: d.isoPath,
          })) || [{ name: 'disk0', sizeGb: storageGb, type: 'virtio', cacheMode: 'none', discard: true, isIso: false }]
        } : undefined,
        networkInterfaces: type !== 'LXC' ? {
          create: networkInterfaces?.map((n: any) => ({
            bridge: n.bridge || 'lxdbr0',
            macAddress: n.macAddress || generateMac(),
            nicModel: n.nicModel || 'virtio',
            ipv4Address: n.ipv4Address || 'dhcp',
            gateway: n.gateway,
          })) || [{ bridge: 'lxdbr0', macAddress: generateMac(), nicModel: 'virtio', ipv4Address: 'dhcp' }]
        } : undefined,
      }
    });

    // Notify of creation and deployment completion
    await NotificationService.notify(job.data.userId || null, 'instance.created', { instance: name, instanceId: instance.id });
    await NotificationService.notify(job.data.userId || null, 'deployment.completed', { instance: name, instanceId: instance.id });

    TaskService.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      currentStage: 'Completed',
      currentStep: 'VPS successfully deployed!',
      logMessage: `VPS instance metadata committed (ID: ${instance.id})`
    });

  } catch (err: any) {
    // Rollback instance on hypervisor on failure
    try {
      const node = await db.node.findUnique({ where: { id: nodeId } });
      if (node) {
        const provider = VirtualizationProviderFactory.getProvider(type);
        await provider.delete(node, { vmid });
      }
    } catch (_) {}

    await NotificationService.notify(job.data.userId || null, 'deployment.failed', { instance: name, error: err.message });

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
      currentStep: 'Tearing down old filesystem...',
      logMessage: 'Removing instance files on hypervisor...'
    });

    const instance = await db.instance.findUnique({ 
      where: { id: instanceId }, 
      include: { node: true, vmConfig: true, cloudInit: true, disks: true, networkInterfaces: true } 
    });
    if (!instance) throw new Error('Instance not found');

    const provider = VirtualizationProviderFactory.getProvider(instance.type);
    
    TaskService.updateTask(taskId, {
      progress: 60,
      currentStage: 'Recreating',
      currentStep: 'Re-deploying root OS layouts...',
      logMessage: 'Deploying fresh OS template root filesystem...'
    });

    // Reinstall via provider
    await provider.reinstall(instance.node, instance, instance);

    await NotificationService.notify(instance.userId || null, 'deployment.completed', { instance: instance.name, instanceId: instance.id });

    TaskService.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      currentStage: 'Completed',
      currentStep: 'OS reinstallation completed!',
      logMessage: 'Fresh guest operating system active.'
    });

  } catch (err: any) {
    try {
      const inst = await db.instance.findUnique({ where: { id: instanceId } });
      await NotificationService.notify(inst?.userId || null, 'deployment.failed', { instance: inst?.name || 'Unknown', error: err.message });
    } catch (_) {}

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

function instanceIdLikeUuid(): string {
  return require('crypto').randomUUID();
}

function generateMac(): string {
  return '52:54:00:' + [
    Math.floor(Math.random() * 255).toString(16).padStart(2, '0'),
    Math.floor(Math.random() * 255).toString(16).padStart(2, '0'),
    Math.floor(Math.random() * 255).toString(16).padStart(2, '0')
  ].join(':');
}

export default router;
