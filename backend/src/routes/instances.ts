import { Router } from 'express';
import { db } from '../db';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { LxdService } from '../services/lxdService';
import { JobService } from '../services/jobService';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = Router();

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

    // Customer ownership check
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this instance' });
    }

    // Fetch real-time status from local/remote LXD
    try {
      const liveStatus = await LxdService.getContainerStatus(instance.vmid, instance.node);
      
      // Sync DB status if changed
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
          uptime: liveStatus.uptime,
          cpu: liveStatus.cpu,
          maxcpu: 1,
          mem: liveStatus.mem,
          maxmem: liveStatus.maxmem,
          disk: liveStatus.disk || 0,
          maxdisk: liveStatus.maxdisk || instance.storageGb * 1024 * 1024 * 1024,
          netin: liveStatus.netin || 0,
          netout: liveStatus.netout || 0
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
 * @desc    Deploys a new LXC container (VM Creation Wizard - Admin Only)
 */
router.post('/', authenticate, requirePermission('instance.create'), async (req: AuthenticatedRequest, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Only administrators can deploy instances' });
  }

  const { nodeId, userId, name, vmid, osTemplate, cpuCores, memoryMb, storageGb, hostname, password } = req.body;
  
  if (!nodeId || !name || !vmid || !osTemplate || !hostname) {
    return res.status(400).json({ error: 'Missing deployment parameters' });
  }

  try {
    // Verify VMID is not occupied
    const existing = await db.instance.findFirst({
      where: { nodeId, vmid: parseInt(vmid, 10) }
    });
    if (existing) {
      return res.status(400).json({ error: `VMID ${vmid} is already allocated` });
    }

    // Deploy container asynchronously using our Job Queue
    const job = await JobService.enqueue('instance.deploy', {
      nodeId,
      name,
      vmid: parseInt(vmid, 10),
      osTemplate,
      cpuCores: parseInt(cpuCores || '1', 10),
      memoryMb: parseInt(memoryMb || '512', 10),
      storageGb: parseInt(storageGb || '10', 10),
      hostname,
      password,
    });

    // Create DB placeholder
    const instance = await db.instance.create({
      data: {
        nodeId,
        userId: userId || null,
        vmid: parseInt(vmid, 10),
        name,
        cpuCores: parseInt(cpuCores || '1', 10),
        memoryMb: parseInt(memoryMb || '512', 10),
        storageGb: parseInt(storageGb || '10', 10),
        osTemplate,
        hostname,
        status: 'starting'
      }
    });

    return res.status(202).json({
      message: 'Container deployment queued successfully.',
      jobId: job.id,
      instance
    });
  } catch (err: any) {
    console.error('Deployment error:', err);
    return res.status(500).json({ error: 'Failed to queue container deployment' });
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

    // Update specs in database
    const updated = await db.instance.update({
      where: { id },
      data: {
        cpuCores: parseInt(cpuCores, 10),
        memoryMb: parseInt(memoryMb, 10),
        storageGb: parseInt(storageGb, 10)
      }
    });

    // Set configuration limits on local LXD container
    const containerName = `cynex-${instance.vmid}`;
    try {
      if (!instance.node || instance.node.hostname === 'localhost') {
        await execAsync(`/snap/bin/lxc config set ${containerName} limits.cpu ${cpuCores}`);
        await execAsync(`/snap/bin/lxc config set ${containerName} limits.memory ${memoryMb}MB`);
      }
    } catch (err: any) {
      console.warn('LXD hardware limits application warning:', err.message);
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
      where: { id: req.params.id },
      include: { node: true }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    // Ownership check
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this instance' });
    }

    await LxdService.startContainer(instance.vmid, instance.node);

    await db.instance.update({
      where: { id: instance.id },
      data: { status: 'running' }
    });

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
      where: { id: req.params.id },
      include: { node: true }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    // Ownership check
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this instance' });
    }

    await LxdService.stopContainer(instance.vmid, instance.node);

    await db.instance.update({
      where: { id: instance.id },
      data: { status: 'stopped' }
    });

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
      where: { id: req.params.id },
      include: { node: true }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    // Ownership check
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this instance' });
    }

    await LxdService.rebootContainer(instance.vmid, instance.node);

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
      where: { id: req.params.id },
      include: { node: true }
    });
    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    // Ownership check
    if (req.user.role !== 'Admin' && instance.userId !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this instance' });
    }

    await LxdService.stopContainer(instance.vmid, instance.node); // LXD stops instantly

    await db.instance.update({
      where: { id: instance.id },
      data: { status: 'stopped' }
    });

    return res.status(200).json({ message: 'Container forcefully killed.' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to kill container' });
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

    // Attempt stop before deletion
    try {
      await LxdService.stopContainer(instance.vmid, instance.node);
      await new Promise(r => setTimeout(r, 2000));
    } catch (_) {}

    await LxdService.deleteContainer(instance.vmid, instance.node);
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

    return res.status(200).json({ message: 'Container destroyed successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to destroy container' });
  }
});

// --- Register Background Workers for Container Deployments ---
JobService.registerWorker('instance.deploy', async (job) => {
  const { nodeId, name, vmid, osTemplate, cpuCores, memoryMb, storageGb, hostname, password } = job.data;
  
  const node = await db.node.findUnique({ where: { id: nodeId } });
  if (!node) throw new Error('Target node not found');

  console.log(`[Worker] Starting deployment for VMID ${vmid} on node ${node.name}...`);
  
  await LxdService.createContainer({
    vmid,
    ostemplate: osTemplate,
    hostname,
    cores: cpuCores,
    memory: memoryMb,
    diskSizeGb: storageGb,
    password
  }, node);

  console.log(`[Worker] Deployment success for VMID ${vmid}`);
  return { status: 'deployed', vmid };
});

export default router;
