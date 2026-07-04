import * as cron from 'node-cron';
import { db } from '../../db';
import { AutomationService } from './AutomationService';

interface ScheduledJob {
  taskId: string;
  task: cron.ScheduledTask;
  expression: string;
}

export class SchedulerService {
  private static jobs: Map<string, ScheduledJob> = new Map();
  private static isRunning = false;
  private static reloadInterval: NodeJS.Timeout | null = null;

  static async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[AutomationScheduler] Starting scheduler...');

    // Load all active tasks from database
    await this.loadJobs();

    // Reload jobs every 60 seconds to pick up changes
    this.reloadInterval = setInterval(() => {
      this.reloadJobs().catch(err => {
        console.error('[AutomationScheduler] Error reloading jobs:', err.message);
      });
    }, 60000);

    // Also check for missed jobs every 60 seconds
    setInterval(() => {
      this.checkMissedJobs().catch(err => {
        console.error('[AutomationScheduler] Error checking missed jobs:', err.message);
      });
    }, 60000);

    console.log(`[AutomationScheduler] Started with ${this.jobs.size} scheduled jobs`);
  }

  static async stop(): Promise<void> {
    this.isRunning = false;

    if (this.reloadInterval) {
      clearInterval(this.reloadInterval);
      this.reloadInterval = null;
    }

    for (const [id, job] of this.jobs) {
      job.task.stop();
      console.log(`[AutomationScheduler] Stopped job: ${id}`);
    }
    this.jobs.clear();
    console.log('[AutomationScheduler] All jobs stopped');
  }

  static async loadJobs(): Promise<void> {
    try {
      const allTasks = await db.automationTask.findMany({
        where: {
          enabled: true,
          status: 'ACTIVE',
          scheduleType: { not: null },
        },
        include: { instance: true },
      });
      const tasks = allTasks.filter(t => t.scheduleType !== 'ONCE');

      for (const task of tasks) {
        this.scheduleTask(task);
      }
    } catch (err: any) {
      console.error('[AutomationScheduler] Error loading jobs:', err.message);
    }
  }

  static async reloadJobs(): Promise<void> {
    // Remove jobs that are no longer in DB or changed
    const activeTasks = await db.automationTask.findMany({
      where: {
        enabled: true,
        status: 'ACTIVE',
        scheduleType: { not: null },
      },
      select: { id: true, scheduleType: true },
    }) as any[];
    const activeTaskIds = new Set(
      activeTasks.filter((t: any) => t.scheduleType !== 'ONCE').map((t: any) => t.id)
    );

    // Remove stale jobs
    for (const [id, job] of this.jobs) {
      if (!activeTaskIds.has(id)) {
        job.task.stop();
        this.jobs.delete(id);
        console.log(`[AutomationScheduler] Removed stale job: ${id}`);
      }
    }

    // Add new or updated jobs
    const allTasks2 = await db.automationTask.findMany({
      where: {
        enabled: true,
        status: 'ACTIVE',
        scheduleType: { not: null },
      },
      include: { instance: true },
    });
    const tasks = allTasks2.filter(t => t.scheduleType !== 'ONCE');

    for (const task of tasks) {
      if (!this.jobs.has(task.id)) {
        this.scheduleTask(task);
      }
    }
  }

  static scheduleTask(task: any): void {
    if (this.jobs.has(task.id)) {
      // Already scheduled, skip
      return;
    }

    let expression = '';
    switch (task.scheduleType) {
      case 'DAILY':
        expression = task.cronExpression || '0 3 * * *';
        break;
      case 'WEEKLY':
        expression = task.cronExpression || '0 3 * * 0';
        break;
      case 'MONTHLY':
        expression = task.cronExpression || '0 3 1 * *';
        break;
      case 'CUSTOM_CRON':
        expression = task.cronExpression || '0 3 * * *';
        break;
      default:
        return;
    }

    if (!cron.validate(expression)) {
      console.warn(`[AutomationScheduler] Invalid cron expression for task ${task.id}: ${expression}`);
      return;
    }

    const scheduledTask = cron.schedule(expression, async () => {
      await this.executeTask(task.id);
    }, {
      timezone: task.timezone || 'UTC',
    });

    this.jobs.set(task.id, { taskId: task.id, task: scheduledTask, expression });
    console.log(`[AutomationScheduler] Scheduled task: ${task.name} (${task.id}) with cron: ${expression} in tz: ${task.timezone}`);
  }

  static unscheduleTask(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.task.stop();
      this.jobs.delete(taskId);
      console.log(`[AutomationScheduler] Unscheduled task: ${taskId}`);
    }
  }

  static async executeTask(taskId: string): Promise<void> {
    try {
      const task = await db.automationTask.findUnique({
        where: { id: taskId },
        include: { instance: true },
      });

      if (!task || !task.enabled || task.status !== 'ACTIVE') {
        console.warn(`[AutomationScheduler] Task ${taskId} is not active, skipping`);
        return;
      }

      // Prevent duplicate execution: check if there's already a RUNNING or QUEUED run
      const existingRun = await db.automationRun.findFirst({
        where: {
          taskId: task.id,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
      });

      if (existingRun) {
        console.log(`[AutomationScheduler] Task ${task.name} already has a pending/active run, skipping`);
        return;
      }

      console.log(`[AutomationScheduler] Executing scheduled task: ${task.name} (${task.id})`);

      const run = await db.automationRun.create({
        data: {
          taskId: task.id,
          status: 'QUEUED',
          triggeredBy: 'schedule',
          attempt: 1,
          maxAttempts: task.retries + 1,
        },
      });

      // Execute in background
      process.nextTick(() => {
        AutomationService.executeRun(run.id).catch(err => {
          console.error(`[AutomationScheduler] Error executing run ${run.id}:`, err.message);
        });
      });
    } catch (err: any) {
      console.error(`[AutomationScheduler] Error executing task ${taskId}:`, err.message);
    }
  }

  static async checkMissedJobs(): Promise<void> {
    try {
      // Find tasks that were supposed to run but didn't
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60000);

      const tasks = await db.automationTask.findMany({
        where: {
          enabled: true,
          status: 'ACTIVE',
          nextRunAt: {
            lte: now,
            gte: fiveMinAgo,
          },
          lastRunAt: {
            not: null,
            lt: fiveMinAgo,
          },
        },
      });

      for (const task of tasks) {
        const existingRun = await db.automationRun.findFirst({
          where: {
            taskId: task.id,
            status: { in: ['QUEUED', 'RUNNING'] },
          },
        });

        if (!existingRun) {
          console.log(`[AutomationScheduler] Found missed job: ${task.name}, executing...`);
          await this.executeTask(task.id);
        }
      }
    } catch (err: any) {
      console.error('[AutomationScheduler] Error checking missed jobs:', err.message);
    }
  }

  static getScheduledJobs(): { taskId: string; expression: string }[] {
    return Array.from(this.jobs.values()).map(j => ({
      taskId: j.taskId,
      expression: j.expression,
    }));
  }
}
