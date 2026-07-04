import { Router } from 'express';
import { db } from '../db';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { AutomationService, TASK_TEMPLATES, DESTRUCTIVE_TASKS, TASK_TYPE_LABELS } from '../services/automation/AutomationService';
import { SchedulerService } from '../services/automation/SchedulerService';

const router = Router();

// Helper to check instance ownership
async function checkInstanceAccess(instanceId: string, userId: string, role: string): Promise<any> {
  const instance = await db.instance.findUnique({ where: { id: instanceId } });
  if (!instance) return null;
  if (role !== 'Admin' && instance.userId !== userId) return null;
  return instance;
}

// ────────────────────────── TASK TEMPLATES ──────────────────────────

router.get('/templates', authenticate, async (req: AuthenticatedRequest, res) => {
  return res.status(200).json(TASK_TEMPLATES);
});

// ────────────────────────── CRUD: TASKS ──────────────────────────

// List tasks for an instance
router.get('/instances/:instanceId/tasks', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const instance = await checkInstanceAccess(req.params.instanceId, req.user.id, req.user.role);
  if (!instance) return res.status(403).json({ error: 'Forbidden' });

  const tasks = await db.automationTask.findMany({
    where: { instanceId: req.params.instanceId },
    include: {
      runs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          duration: true,
          triggeredBy: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.status(200).json(tasks);
});

// Get single task
router.get('/tasks/:taskId', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const task = await db.automationTask.findUnique({
    where: { id: req.params.taskId },
    include: { instance: { select: { id: true, userId: true, name: true } } },
  });

  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.user.role !== 'Admin' && task.instance.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.status(200).json(task);
});

// Create task
router.post('/instances/:instanceId/tasks', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const instance = await checkInstanceAccess(req.params.instanceId, req.user.id, req.user.role);
  if (!instance) return res.status(403).json({ error: 'Forbidden' });

  const {
    name, description, taskType, scheduleType, cronExpression, timezone,
    retries, retryDelay, timeout, enabled, notifyOnSuccess, notifyOnFailure,
    shellCommand, hostname, deleteOlderThan,
    parentTaskId, chainStep, stopOnFailure,
  } = req.body;

  if (!name || !taskType) {
    return res.status(400).json({ error: 'Name and taskType are required' });
  }

  const validTaskTypes = Object.keys(TASK_TYPE_LABELS);
  if (!validTaskTypes.includes(taskType)) {
    return res.status(400).json({ error: `Invalid taskType. Valid: ${validTaskTypes.join(', ')}` });
  }

  if (![null, undefined, 'ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM_CRON'].includes(scheduleType)) {
    return res.status(400).json({ error: 'Invalid scheduleType' });
  }

  if (taskType === 'EXECUTION_SHELL_COMMAND' && !shellCommand) {
    return res.status(400).json({ error: 'shellCommand is required for EXECUTION_SHELL_COMMAND' });
  }

  if (taskType === 'MAINTENANCE_CHANGE_HOSTNAME' && !hostname) {
    return res.status(400).json({ error: 'hostname is required for MAINTENANCE_CHANGE_HOSTNAME' });
  }

  const nextRunAt = scheduleType && scheduleType !== 'ONCE'
    ? await AutomationService.calculateNextRun(scheduleType, cronExpression, timezone)
    : null;

  const task = await db.automationTask.create({
    data: {
      name,
      description,
      taskType,
      scheduleType: scheduleType || null,
      cronExpression: cronExpression || null,
      timezone: timezone || 'UTC',
      retries: retries ?? 0,
      retryDelay: retryDelay ?? 60000,
      timeout: timeout ?? 300000,
      enabled: enabled ?? true,
      notifyOnSuccess: notifyOnSuccess ?? true,
      notifyOnFailure: notifyOnFailure ?? true,
      status: 'ACTIVE',
      shellCommand,
      hostname,
      deleteOlderThan: deleteOlderThan ? parseInt(deleteOlderThan, 10) : null,
      parentTaskId: parentTaskId || null,
      chainStep: chainStep || null,
      stopOnFailure: stopOnFailure ?? true,
      instanceId: instance.id,
      userId: req.user.id,
      nextRunAt,
    },
  });

  // Schedule if it's a recurring task
  if (scheduleType && scheduleType !== 'ONCE' && task.enabled) {
    const fullTask = await db.automationTask.findUnique({
      where: { id: task.id },
      include: { instance: true },
    });
    if (fullTask) SchedulerService.scheduleTask(fullTask);
  }

  return res.status(201).json(task);
});

// Create task from template
router.post('/instances/:instanceId/tasks/from-template', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const instance = await checkInstanceAccess(req.params.instanceId, req.user.id, req.user.role);
  if (!instance) return res.status(403).json({ error: 'Forbidden' });

  const { templateIndex } = req.body;
  if (templateIndex === undefined || templateIndex < 0 || templateIndex >= TASK_TEMPLATES.length) {
    return res.status(400).json({ error: 'Invalid template index' });
  }

  const template = TASK_TEMPLATES[templateIndex];

  const nextRunAt = await AutomationService.calculateNextRun(template.scheduleType, template.cronExpression);

  const task = await db.automationTask.create({
    data: {
      name: template.name,
      description: template.description,
      taskType: template.taskType,
      scheduleType: template.scheduleType,
      cronExpression: template.cronExpression || null,
      timezone: 'UTC',
      retries: template.retries,
      timeout: template.timeout,
      enabled: true,
      notifyOnSuccess: template.notifyOnSuccess,
      notifyOnFailure: template.notifyOnFailure,
      status: 'ACTIVE',
      shellCommand: template.shellCommand || null,
      instanceId: instance.id,
      userId: req.user.id,
      nextRunAt,
    },
  });

  if (template.scheduleType !== 'ONCE') {
    const fullTask = await db.automationTask.findUnique({
      where: { id: task.id },
      include: { instance: true },
    });
    if (fullTask) SchedulerService.scheduleTask(fullTask);
  }

  return res.status(201).json(task);
});

// Update task
router.put('/tasks/:taskId', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const task = await db.automationTask.findUnique({
    where: { id: req.params.taskId },
    include: { instance: { select: { id: true, userId: true } } },
  });

  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.user.role !== 'Admin' && task.instance.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const {
    name, description, scheduleType, cronExpression, timezone,
    retries, retryDelay, timeout, enabled, notifyOnSuccess, notifyOnFailure,
    shellCommand, hostname, deleteOlderThan, status,
  } = req.body;

  const updateData: any = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (scheduleType !== undefined) updateData.scheduleType = scheduleType;
  if (cronExpression !== undefined) updateData.cronExpression = cronExpression;
  if (timezone !== undefined) updateData.timezone = timezone;
  if (retries !== undefined) updateData.retries = retries;
  if (retryDelay !== undefined) updateData.retryDelay = retryDelay;
  if (timeout !== undefined) updateData.timeout = timeout;
  if (enabled !== undefined) updateData.enabled = enabled;
  if (notifyOnSuccess !== undefined) updateData.notifyOnSuccess = notifyOnSuccess;
  if (notifyOnFailure !== undefined) updateData.notifyOnFailure = notifyOnFailure;
  if (shellCommand !== undefined) updateData.shellCommand = shellCommand;
  if (hostname !== undefined) updateData.hostname = hostname;
  if (deleteOlderThan !== undefined) updateData.deleteOlderThan = deleteOlderThan ? parseInt(deleteOlderThan, 10) : null;
  if (status !== undefined) updateData.status = status;

  // Recalculate next run if schedule changed
  const finalScheduleType = scheduleType ?? task.scheduleType;
  const finalCron = cronExpression ?? task.cronExpression;
  const finalTz = timezone ?? task.timezone;
  if (scheduleType !== undefined || cronExpression !== undefined) {
    if (finalScheduleType && finalScheduleType !== 'ONCE') {
      updateData.nextRunAt = await AutomationService.calculateNextRun(finalScheduleType, finalCron, finalTz);
    } else {
      updateData.nextRunAt = null;
    }
  }

  const updated = await db.automationTask.update({
    where: { id: task.id },
    data: updateData,
  });

  // Reschedule or unschedule
  SchedulerService.unscheduleTask(task.id);
  const reloadedTask = await db.automationTask.findUnique({
    where: { id: task.id },
    include: { instance: true },
  });
  if (reloadedTask && reloadedTask.enabled && reloadedTask.status === 'ACTIVE' && reloadedTask.scheduleType && reloadedTask.scheduleType !== 'ONCE') {
    SchedulerService.scheduleTask(reloadedTask);
  }

  return res.status(200).json(updated);
});

// Delete task
router.delete('/tasks/:taskId', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const task = await db.automationTask.findUnique({
    where: { id: req.params.taskId },
    include: { instance: { select: { id: true, userId: true } } },
  });

  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.user.role !== 'Admin' && task.instance.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Unschedule
  SchedulerService.unscheduleTask(task.id);

  await db.automationTask.delete({ where: { id: task.id } });

  return res.status(200).json({ message: 'Task deleted' });
});

// ────────────────────────── EXECUTION ──────────────────────────

// Run task manually
router.post('/tasks/:taskId/run', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const task = await db.automationTask.findUnique({
    where: { id: req.params.taskId },
    include: { instance: { select: { id: true, userId: true } } },
  });

  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.user.role !== 'Admin' && task.instance.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Check for destructive tasks
  if (DESTRUCTIVE_TASKS.includes(task.taskType as any) && req.body.confirm !== true) {
    return res.status(400).json({ error: 'Confirmation required for destructive action', requiresConfirm: true });
  }

  // Prevent duplicate execution
  const existingRun = await db.automationRun.findFirst({
    where: {
      taskId: task.id,
      status: { in: ['QUEUED', 'RUNNING'] },
    },
  });

  if (existingRun) {
    return res.status(409).json({ error: 'Task already has a pending/active run' });
  }

  const run = await AutomationService.executeManual(task.id, req.user.id);

  return res.status(202).json(run);
});

// ────────────────────────── RUNS / LOGS ──────────────────────────

// List runs for a task
router.get('/tasks/:taskId/runs', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const task = await db.automationTask.findUnique({
    where: { id: req.params.taskId },
    include: { instance: { select: { id: true, userId: true } } },
  });

  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (req.user.role !== 'Admin' && task.instance.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [runs, total] = await Promise.all([
    db.automationRun.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.automationRun.count({ where: { taskId: task.id } }),
  ]);

  return res.status(200).json({ runs, total, page, limit });
});

// List all runs for an instance
router.get('/instances/:instanceId/runs', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const instance = await checkInstanceAccess(req.params.instanceId, req.user.id, req.user.role);
  if (!instance) return res.status(403).json({ error: 'Forbidden' });

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;
  const status = req.query.status as string;

  const where: any = {
    task: { instanceId: instance.id },
  };
  if (status) where.status = status;

  const [runs, total] = await Promise.all([
    db.automationRun.findMany({
      where,
      include: {
        task: { select: { id: true, name: true, taskType: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.automationRun.count({ where }),
  ]);

  return res.status(200).json({ runs, total, page, limit });
});

// Get single run with logs
router.get('/runs/:runId', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const run = await db.automationRun.findUnique({
    where: { id: req.params.runId },
    include: {
      task: {
        include: { instance: { select: { id: true, userId: true, name: true } } },
      },
      logs: { orderBy: { timestamp: 'asc' } },
    },
  });

  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (req.user.role !== 'Admin' && run.task.instance.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.status(200).json(run);
});

// Retry a failed run
router.post('/runs/:runId/retry', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const run = await db.automationRun.findUnique({
    where: { id: req.params.runId },
    include: {
      task: {
        include: { instance: { select: { id: true, userId: true } } },
      },
    },
  });

  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (req.user.role !== 'Admin' && run.task.instance.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (run.status !== 'FAILED') {
    return res.status(400).json({ error: 'Can only retry failed runs' });
  }

  const newRun = await AutomationService.retryRun(run.id);

  return res.status(202).json(newRun);
});

// Cancel a run
router.post('/runs/:runId/cancel', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const run = await db.automationRun.findUnique({
    where: { id: req.params.runId },
    include: {
      task: {
        include: { instance: { select: { id: true, userId: true } } },
      },
    },
  });

  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (req.user.role !== 'Admin' && run.task.instance.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (run.status !== 'QUEUED' && run.status !== 'RUNNING') {
    return res.status(400).json({ error: 'Can only cancel queued or running runs' });
  }

  await db.automationRun.update({
    where: { id: run.id },
    data: { status: 'CANCELLED', finishedAt: new Date() },
  });

  return res.status(200).json({ message: 'Run cancelled' });
});

// ────────────────────────── ADMIN ──────────────────────────

// Admin: List all automation tasks across all instances
router.get('/admin/tasks', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;
  const search = req.query.search as string;
  const status = req.query.status as string;
  const taskType = req.query.taskType as string;

  const where: any = {};
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { instance: { name: { contains: search } } },
    ];
  }
  if (status) where.status = status;
  if (taskType) where.taskType = taskType;

  const [tasks, total] = await Promise.all([
    db.automationTask.findMany({
      where,
      include: {
        instance: { select: { id: true, name: true } },
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, status: true, startedAt: true, finishedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.automationTask.count({ where }),
  ]);

  return res.status(200).json({ tasks, total, page, limit });
});

// Admin: Get automation stats
router.get('/admin/stats', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const [totalTasks, activeTasks, totalRuns, failedRuns, completedRuns, totalScheduled] = await Promise.all([
    db.automationTask.count(),
    db.automationTask.count({ where: { enabled: true, status: 'ACTIVE' } }),
    db.automationRun.count(),
    db.automationRun.count({ where: { status: 'FAILED' } }),
    db.automationRun.count({ where: { status: 'COMPLETED' } }),
    (async () => {
      const scheduledTasks = await db.automationTask.findMany({
        where: { enabled: true, status: 'ACTIVE', scheduleType: { not: null } },
        select: { scheduleType: true },
      });
      return scheduledTasks.filter(t => t.scheduleType !== 'ONCE').length;
    })(),
  ]);

  return res.status(200).json({
    totalTasks,
    activeTasks,
    totalRuns,
    failedRuns,
    completedRuns,
    totalScheduled,
  });
});

// ────────────────────────── INSTANCE SUMMARY ──────────────────────────

// Get automation summary for an instance
router.get('/instances/:instanceId/summary', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const instance = await checkInstanceAccess(req.params.instanceId, req.user.id, req.user.role);
  if (!instance) return res.status(403).json({ error: 'Forbidden' });

  const [nextTask, lastRun, upcomingTasks, failedTasks] = await Promise.all([
    db.automationTask.findFirst({
      where: { instanceId: instance.id, enabled: true, status: 'ACTIVE', nextRunAt: { not: null } },
      orderBy: { nextRunAt: 'asc' },
      select: { id: true, name: true, nextRunAt: true, taskType: true },
    }),
    db.automationRun.findFirst({
      where: { task: { instanceId: instance.id } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true, task: { select: { name: true } } },
    }),
    db.automationTask.findMany({
      where: { instanceId: instance.id, enabled: true, status: 'ACTIVE', nextRunAt: { not: null } },
      orderBy: { nextRunAt: 'asc' },
      take: 5,
      select: { id: true, name: true, nextRunAt: true, taskType: true },
    }),
    db.automationTask.count({
      where: { instanceId: instance.id, lastRunStatus: 'FAILED' },
    }),
  ]);

  return res.status(200).json({ nextTask, lastRun, upcomingTasks, failedTasks });
});

export default router;
