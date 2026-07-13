import { db } from '../../db';
import { LxdContainerService } from '../lxd/lxdContainerService';
import { LxdClient } from '../lxd/lxdClient';
import { LxdFileService } from '../lxd/lxdFileService';
import { NotificationService } from '../notification/notificationService';
import { SocketService } from '../socketService';
import { LockManager } from '../lockManager';

export type TaskType =
  | 'POWER_START'
  | 'POWER_STOP'
  | 'POWER_RESTART'
  | 'POWER_FORCE_STOP'
  | 'POWER_FREEZE'
  | 'POWER_UNFREEZE'
  | 'STORAGE_BACKUP'
  | 'STORAGE_SNAPSHOT'
  | 'STORAGE_DELETE_OLD_BACKUPS'
  | 'STORAGE_DELETE_OLD_SNAPSHOTS'
  | 'MAINTENANCE_REINSTALL_OS'
  | 'MAINTENANCE_UPDATE_PACKAGES'
  | 'MAINTENANCE_CHANGE_HOSTNAME'
  | 'EXECUTION_SHELL_COMMAND';

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  POWER_START: 'Start Container',
  POWER_STOP: 'Stop Container',
  POWER_RESTART: 'Restart Container',
  POWER_FORCE_STOP: 'Force Stop',
  POWER_FREEZE: 'Freeze',
  POWER_UNFREEZE: 'Unfreeze',
  STORAGE_BACKUP: 'Create Backup',
  STORAGE_SNAPSHOT: 'Create Snapshot',
  STORAGE_DELETE_OLD_BACKUPS: 'Delete Old Backups',
  STORAGE_DELETE_OLD_SNAPSHOTS: 'Delete Old Snapshots',
  MAINTENANCE_REINSTALL_OS: 'Reinstall OS',
  MAINTENANCE_UPDATE_PACKAGES: 'Update Container Packages',
  MAINTENANCE_CHANGE_HOSTNAME: 'Change Hostname',
  EXECUTION_SHELL_COMMAND: 'Execute Shell Command',
};

export const DESTRUCTIVE_TASKS: TaskType[] = [
  'POWER_FORCE_STOP',
  'STORAGE_DELETE_OLD_BACKUPS',
  'STORAGE_DELETE_OLD_SNAPSHOTS',
  'MAINTENANCE_REINSTALL_OS',
];

export interface ITaskTemplate {
  name: string;
  description: string;
  taskType: TaskType;
  scheduleType: string;
  cronExpression?: string;
  shellCommand?: string;
  retries: number;
  timeout: number;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
}

export const TASK_TEMPLATES: ITaskTemplate[] = [
  {
    name: 'Weekly Backup',
    description: 'Creates a full backup of the container every week',
    taskType: 'STORAGE_BACKUP',
    scheduleType: 'WEEKLY',
    cronExpression: '0 3 * * 0',
    retries: 2,
    timeout: 600000,
    notifyOnSuccess: true,
    notifyOnFailure: true,
  },
  {
    name: 'Nightly Restart',
    description: 'Restarts the container every night at 04:00',
    taskType: 'POWER_RESTART',
    scheduleType: 'DAILY',
    cronExpression: '0 4 * * *',
    retries: 1,
    timeout: 120000,
    notifyOnSuccess: true,
    notifyOnFailure: true,
  },
  {
    name: 'Daily apt update',
    description: 'Runs apt update and upgrade daily',
    taskType: 'EXECUTION_SHELL_COMMAND',
    scheduleType: 'DAILY',
    cronExpression: '0 3 * * *',
    shellCommand: 'apt update && apt upgrade -y',
    retries: 2,
    timeout: 300000,
    notifyOnSuccess: false,
    notifyOnFailure: true,
  },
  {
    name: 'Weekly Docker Cleanup',
    description: 'Cleans up unused Docker resources weekly',
    taskType: 'EXECUTION_SHELL_COMMAND',
    scheduleType: 'WEEKLY',
    cronExpression: '0 2 * * 0',
    shellCommand: 'docker system prune -af --volumes',
    retries: 1,
    timeout: 300000,
    notifyOnSuccess: false,
    notifyOnFailure: true,
  },
  {
    name: 'Monthly Snapshot',
    description: 'Creates a monthly snapshot checkpoint',
    taskType: 'STORAGE_SNAPSHOT',
    scheduleType: 'MONTHLY',
    cronExpression: '0 2 1 * *',
    retries: 1,
    timeout: 300000,
    notifyOnSuccess: true,
    notifyOnFailure: true,
  },
];

export class AutomationService {
  static async executeRun(runId: string): Promise<void> {
    const run = await db.automationRun.findUnique({
      where: { id: runId },
      include: { task: { include: { instance: { include: { node: true } } } } },
    });
    if (!run || !run.task) throw new Error('Run or task not found');

    const task = run.task;
    const instance = task.instance;
    const nodeId = instance.nodeId;
    const vmid = instance.vmid;
    const containerName = `cynex-${vmid}`;

    const lockKey = `automation:${task.id}`;
    if (!LockManager.acquire(lockKey, 'automation')) {
      await this._failRun(runId, 'Another automation task is already running on this instance');
      return;
    }

    await this._updateRunStatus(runId, 'RUNNING', { startedAt: new Date() });
    await this._addLog(runId, 'info', `Starting task: ${task.name} (${TASK_TYPE_LABELS[task.taskType as TaskType] || task.taskType})`);

    const startTime = Date.now();
    let consoleOutput = '';
    let exitCode: number | null = null;
    let errorMessage: string | null = null;
    let finalStatus: string = 'COMPLETED';

    try {
      switch (task.taskType) {
        case 'POWER_START':
          await this._powerAction(nodeId, vmid, task.id, runId, 'start');
          await db.instance.update({ where: { id: instance.id }, data: { status: 'running' } });
          break;
        case 'POWER_STOP':
          await this._powerAction(nodeId, vmid, task.id, runId, 'stop');
          await db.instance.update({ where: { id: instance.id }, data: { status: 'stopped' } });
          break;
        case 'POWER_RESTART':
          await this._powerAction(nodeId, vmid, task.id, runId, 'restart');
          break;
        case 'POWER_FORCE_STOP':
          await this._powerAction(nodeId, vmid, task.id, runId, 'stop', true);
          await db.instance.update({ where: { id: instance.id }, data: { status: 'stopped' } });
          break;
        case 'POWER_FREEZE':
          await this._powerAction(nodeId, vmid, task.id, runId, 'freeze');
          await db.instance.update({ where: { id: instance.id }, data: { status: 'frozen' } });
          break;
        case 'POWER_UNFREEZE':
          await this._powerAction(nodeId, vmid, task.id, runId, 'unfreeze');
          await db.instance.update({ where: { id: instance.id }, data: { status: 'running' } });
          break;
        case 'STORAGE_BACKUP':
          await this._createBackup(instance, nodeId, vmid, runId);
          break;
        case 'STORAGE_SNAPSHOT':
          await this._createSnapshot(instance, nodeId, vmid, runId);
          break;
        case 'STORAGE_DELETE_OLD_BACKUPS':
          await this._deleteOldBackups(instance, task, runId);
          break;
        case 'STORAGE_DELETE_OLD_SNAPSHOTS':
          await this._deleteOldSnapshots(instance, task, runId);
          break;
        case 'MAINTENANCE_REINSTALL_OS':
          await this._reinstallOS(instance, nodeId, vmid, runId);
          break;
        case 'MAINTENANCE_UPDATE_PACKAGES':
          ({ consoleOutput, exitCode } = await this._execShell(nodeId, vmid, containerName, 'apt update && apt upgrade -y', task.timeout, runId));
          break;
        case 'MAINTENANCE_CHANGE_HOSTNAME':
          if (task.hostname) {
            await this._changeHostname(nodeId, vmid, containerName, task.hostname, runId);
          } else {
            throw new Error('Hostname not specified for CHANGE_HOSTNAME task');
          }
          break;
        case 'EXECUTION_SHELL_COMMAND':
          if (task.shellCommand) {
            ({ consoleOutput, exitCode } = await this._execShell(nodeId, vmid, containerName, task.shellCommand, task.timeout, runId));
          } else {
            throw new Error('No shell command specified');
          }
          break;
        default:
          throw new Error(`Unknown task type: ${task.taskType}`);
      }

      await this._addLog(runId, 'info', 'Task completed successfully');
      finalStatus = 'COMPLETED';
    } catch (err: any) {
      errorMessage = err.message;
      await this._addLog(runId, 'error', `Task failed: ${errorMessage}`);

      if (run.attempt < run.maxAttempts) {
        finalStatus = 'RETRYING';
        await this._addLog(runId, 'warn', `Scheduling retry ${run.attempt + 1}/${run.maxAttempts}`);
      } else {
        finalStatus = 'FAILED';
      }
    } finally {
      const duration = Date.now() - startTime;
      await this._updateRunStatus(runId, finalStatus, {
        finishedAt: new Date(),
        duration,
        exitCode,
        consoleOutput,
        errorMessage,
      });

      await db.automationTask.update({
        where: { id: task.id },
        data: {
          lastRunAt: new Date(),
          lastRunStatus: finalStatus,
        },
      });

      LockManager.release(lockKey, 'automation');

      // Socket.IO real-time update
      const runData = await db.automationRun.findUnique({
        where: { id: runId },
        include: { task: { select: { instanceId: true, userId: true } } },
      });
      if (runData) {
        SocketService.emitToUser(task.userId, 'automation:run-update', runData);
      }

      // Notifications
      if (finalStatus === 'COMPLETED' && task.notifyOnSuccess) {
        await this._sendNotification(task, instance, 'completed', null);
      } else if (finalStatus === 'FAILED' && task.notifyOnFailure) {
        await this._sendNotification(task, instance, 'failed', errorMessage);
      }

      // Handle chain: execute child task if this one succeeded (or if stopOnFailure is false)
      if (finalStatus === 'COMPLETED' || !task.stopOnFailure) {
        await this._executeNextInChain(task.id);
      } else if (task.stopOnFailure && finalStatus === 'FAILED') {
        await this._failChain(task.id, errorMessage);
      }
    }
  }

  static async retryRun(runId: string): Promise<any> {
    const run = await db.automationRun.findUnique({
      where: { id: runId },
      include: { task: { include: { instance: true } } },
    });
    if (!run) throw new Error('Run not found');

    const newRun = await db.automationRun.create({
      data: {
        taskId: run.taskId,
        status: 'QUEUED',
        triggeredBy: run.triggeredBy,
        triggeredByUserId: run.triggeredByUserId,
        attempt: run.attempt + 1,
        maxAttempts: run.maxAttempts,
      },
    });

    SocketService.emitToUser(run.task.userId, 'automation:run-update', newRun);

    process.nextTick(() => {
      AutomationService.executeRun(newRun.id).catch(console.error);
    });

    return newRun;
  }

  static async executeManual(taskId: string, userId: string): Promise<any> {
    const task = await db.automationTask.findUnique({
      where: { id: taskId },
      include: { instance: true },
    });
    if (!task) throw new Error('Task not found');

    const run = await db.automationRun.create({
      data: {
        taskId: task.id,
        status: 'QUEUED',
        triggeredBy: 'manual',
        triggeredByUserId: userId,
        attempt: 1,
        maxAttempts: task.retries + 1,
      },
    });

    SocketService.emitToUser(task.userId, 'automation:run-update', run);

    process.nextTick(() => {
      AutomationService.executeRun(run.id).catch(console.error);
    });

    return run;
  }

  static async calculateNextRun(scheduleType: string, cronExpression?: string, timezone?: string): Promise<Date | null> {
    if (!scheduleType || scheduleType === 'ONCE') return null;

    const now = new Date();
    const tz = timezone || 'UTC';

    try {
      const cron = require('node-cron');
      let expr: string;

      switch (scheduleType) {
        case 'DAILY':
          expr = cronExpression || '0 3 * * *';
          break;
        case 'WEEKLY':
          expr = cronExpression || '0 3 * * 0';
          break;
        case 'MONTHLY':
          expr = cronExpression || '0 3 1 * *';
          break;
        case 'CUSTOM_CRON':
          expr = cronExpression || '0 3 * * *';
          break;
        default:
          return null;
      }

      if (!cron.validate(expr)) return null;

      // Schedule 5 minutes from now to avoid immediate re-triggers
      const baseDate = new Date(now.getTime() + 60000);

      // Use node-cron to find next scheduled time
      const scheduledDate = this._getNextCronDate(expr, baseDate);
      return scheduledDate;
    } catch {
      return null;
    }
  }

  private static _getNextCronDate(expression: string, fromDate: Date): Date {
    const cron = require('node-cron');
    let nextDate: Date | null = null;

    // Check every minute for the next 24 hours
    for (let i = 0; i < 1440; i++) {
      const candidate = new Date(fromDate.getTime() + i * 60000);
      if (cron.schedule(expression, { scheduled: false, timezone: 'UTC' })) {
        // cron.schedule returns true if the expression matches the current time
        const cronExpr = expression;
        const parts = cronExpr.split(' ');
        if (parts.length === 5) {
          const minute = candidate.getUTCMinutes();
          const hour = candidate.getUTCHours();
          const dayOfMonth = candidate.getUTCDate();
          const month = candidate.getUTCMonth() + 1;
          const dayOfWeek = candidate.getUTCDay();

          if (
            this._cronMatch(parts[0], minute) &&
            this._cronMatch(parts[1], hour) &&
            this._cronMatch(parts[2], dayOfMonth) &&
            this._cronMatch(parts[3], month) &&
            this._cronMatch(parts[4], dayOfWeek)
          ) {
            nextDate = candidate;
            break;
          }
        }
      }
    }

    return nextDate || new Date(fromDate.getTime() + 86400000);
  }

  private static _cronMatch(pattern: string, value: number): boolean {
    if (pattern === '*') return true;
    if (pattern.includes(',')) return pattern.split(',').some(p => this._cronMatch(p, value));
    if (pattern.includes('/')) {
      const [start, step] = pattern.split('/');
      const startVal = start === '*' ? 0 : parseInt(start, 10);
      return value >= startVal && (value - startVal) % parseInt(step, 10) === 0;
    }
    if (pattern.includes('-')) {
      const [low, high] = pattern.split('-').map(Number);
      return value >= low && value <= high;
    }
    return parseInt(pattern, 10) === value;
  }

  private static async _powerAction(nodeId: string | null, vmid: number, taskId: string, runId: string, action: 'start' | 'stop' | 'restart' | 'freeze' | 'unfreeze', force = false): Promise<void> {
    await this._addLog(runId, 'info', `Executing power action: ${action}${force ? ' (force)' : ''}`);
    await LxdContainerService.setStatus(nodeId, vmid, action, force);
    await this._addLog(runId, 'info', `Power action '${action}' completed`);
  }

  private static async _createBackup(instance: any, nodeId: string | null, vmid: number, runId: string): Promise<void> {
    await this._addLog(runId, 'info', 'Creating backup...');
    const backupName = `auto-backup-${instance.name}-${Date.now()}`;

    const { LxdClient } = require('../lxd/lxdClient');
    const containerName = `cynex-${vmid}`;

    // Create backup via LXD API
    try {
      await LxdClient.request(nodeId, `/1.0/instances/${containerName}/backups`, 'POST', {
        name: backupName,
        compression_algorithm: 'gzip',
      });

      // Wait for backup to complete
      await new Promise(resolve => setTimeout(resolve, 5000));

      await db.backup.create({
        data: {
          instanceId: instance.id,
          storageProviderId: (await db.storageProvider.findFirst())?.id || 'default',
          name: backupName,
          status: 'completed',
          type: 'scheduled',
        },
      });

      await this._addLog(runId, 'info', `Backup '${backupName}' created successfully`);

      await NotificationService.notify(instance.userId, 'backup.completed', {
        instance: instance.name,
        instanceId: instance.id,
        size: 'Scheduled',
      });
    } catch (err: any) {
      await this._addLog(runId, 'error', `Backup failed: ${err.message}`);
      throw err;
    }
  }

  private static async _createSnapshot(instance: any, nodeId: string | null, vmid: number, runId: string): Promise<void> {
    await this._addLog(runId, 'info', 'Creating snapshot...');
    const snapshotName = `auto-snap-${Date.now()}`;

    const { LxdClient } = require('../lxd/lxdClient');
    const containerName = `cynex-${vmid}`;

    try {
      await LxdClient.request(nodeId, `/1.0/instances/${containerName}/snapshots`, 'POST', {
        name: snapshotName,
      });

      await db.snapshot.create({
        data: {
          instanceId: instance.id,
          name: snapshotName,
          description: 'Automated snapshot',
          status: 'active',
        },
      });

      await this._addLog(runId, 'info', `Snapshot '${snapshotName}' created successfully`);

      await NotificationService.notify(instance.userId, 'snapshot.created', {
        instance: instance.name,
        instanceId: instance.id,
        snapshot: snapshotName,
      });
    } catch (err: any) {
      await this._addLog(runId, 'error', `Snapshot failed: ${err.message}`);
      throw err;
    }
  }

  private static async _deleteOldBackups(instance: any, task: any, runId: string): Promise<void> {
    const olderThanDays = task.deleteOlderThan || 30;
    const cutoff = new Date(Date.now() - olderThanDays * 86400000);

    await this._addLog(runId, 'info', `Deleting backups older than ${olderThanDays} days (before ${cutoff.toISOString()})`);

    const oldBackups = await db.backup.findMany({
      where: {
        instanceId: instance.id,
        createdAt: { lt: cutoff },
      },
    });

    if (oldBackups.length === 0) {
      await this._addLog(runId, 'info', 'No old backups to delete');
      return;
    }

    for (const backup of oldBackups) {
      await db.backup.delete({ where: { id: backup.id } });
      await this._addLog(runId, 'info', `Deleted backup: ${backup.name}`);
    }

    await this._addLog(runId, 'info', `Deleted ${oldBackups.length} old backup(s)`);
  }

  private static async _deleteOldSnapshots(instance: any, task: any, runId: string): Promise<void> {
    const olderThanDays = task.deleteOlderThan || 30;
    const cutoff = new Date(Date.now() - olderThanDays * 86400000);

    await this._addLog(runId, 'info', `Deleting snapshots older than ${olderThanDays} days (before ${cutoff.toISOString()})`);

    const oldSnapshots = await db.snapshot.findMany({
      where: {
        instanceId: instance.id,
        createdAt: { lt: cutoff },
      },
    });

    if (oldSnapshots.length === 0) {
      await this._addLog(runId, 'info', 'No old snapshots to delete');
      return;
    }

    for (const snap of oldSnapshots) {
      await db.snapshot.delete({ where: { id: snap.id } });
      await this._addLog(runId, 'info', `Deleted snapshot: ${snap.name}`);
    }

    await this._addLog(runId, 'info', `Deleted ${oldSnapshots.length} old snapshot(s)`);
  }

  private static async _reinstallOS(instance: any, nodeId: string | null, vmid: number, runId: string): Promise<void> {
    await this._addLog(runId, 'info', 'Reinstalling OS...');

    const { LxdContainerService } = require('../lxd/lxdContainerService');
    await LxdContainerService.delete(nodeId, vmid);

    await this._addLog(runId, 'info', 'Container deleted, recreating...');

    await LxdContainerService.create(nodeId, {
      vmid: instance.vmid,
      ostemplate: instance.osTemplate,
      hostname: instance.hostname,
      cores: instance.cpuCores,
      memory: instance.memoryMb,
      diskSizeGb: instance.storageGb,
      password: instance.password || 'admin',
    });

    await this._addLog(runId, 'info', 'OS reinstallation completed');
  }

  private static async _changeHostname(nodeId: string | null, vmid: number, containerName: string, newHostname: string, runId: string): Promise<void> {
    await this._addLog(runId, 'info', `Changing hostname to '${newHostname}'`);

    await LxdClient.request(nodeId, `/1.0/instances/${containerName}/exec`, 'POST', {
      command: ['sh', '-c', `hostnamectl set-hostname "${newHostname.replace(/"/g, '\\"')}" && echo "${newHostname.replace(/"/g, '\\"')}" > /etc/hostname`],
      environment: {},
      'wait-for-variables': true,
      record: false,
    });

    await this._addLog(runId, 'info', 'Hostname changed successfully');

    const targetInstance = await db.instance.findFirst({
      where: { vmid, nodeId: nodeId ?? undefined },
    });
    if (targetInstance) {
      await db.instance.update({
        where: { id: targetInstance.id },
        data: { hostname: newHostname },
      });
    }
  }

  private static async _execShell(
    nodeId: string | null,
    vmid: number,
    containerName: string,
    command: string,
    timeout: number,
    runId: string,
  ): Promise<{ consoleOutput: string; exitCode: number | null }> {
    await this._addLog(runId, 'info', `Executing command: ${command}`);

    const escapedCommand = command.replace(/"/g, '\\"');
    const outputFile = `/tmp/cynex-auto-${Date.now()}.out`;

    let output = '';
    let exitCode: number | null = null;

    try {
      // Run command and capture output
      await LxdClient.request(nodeId, `/1.0/instances/${containerName}/exec`, 'POST', {
        command: ['sh', '-c', `(${escapedCommand}) > ${outputFile} 2>&1; echo "EXIT_CODE=$?" >> ${outputFile}`],
        environment: {},
        'wait-for-variables': true,
        record: false,
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Read output file
      try {
        output = await LxdFileService.readFile(nodeId, vmid, outputFile);

        const exitMatch = output.match(/EXIT_CODE=(\d+)/);
        if (exitMatch) {
          exitCode = parseInt(exitMatch[1], 10);
          output = output.replace(/EXIT_CODE=\d+\n?/, '').trim();
        }
      } catch {
        output = '(output capture failed)';
      }

      // Cleanup
      await LxdFileService.deleteFile(nodeId, vmid, outputFile).catch(() => {});

      await this._addLog(runId, 'info', `Command completed with exit code ${exitCode}`);
    } catch (err: any) {
      await this._addLog(runId, 'error', `Command execution error: ${err.message}`);
      throw err;
    }

    return { consoleOutput: output, exitCode };
  }

  private static async _executeNextInChain(taskId: string): Promise<void> {
    const nextTask = await db.automationTask.findFirst({
      where: { parentTaskId: taskId },
      orderBy: { chainStep: 'asc' },
    });

    if (!nextTask) return;

    await this._addLog(null, 'info', `Executing next task in chain: ${nextTask.name}`);

    const run = await db.automationRun.create({
      data: {
        taskId: nextTask.id,
        status: 'QUEUED',
        triggeredBy: 'chain',
        attempt: 1,
        maxAttempts: nextTask.retries + 1,
      },
    });

    SocketService.emitToUser(nextTask.userId, 'automation:run-update', run);

    process.nextTick(() => {
      AutomationService.executeRun(run.id).catch(console.error);
    });
  }

  private static async _failChain(taskId: string, error: string | null): Promise<void> {
    const childTasks = await db.automationTask.findMany({
      where: { parentTaskId: taskId },
      orderBy: { chainStep: 'asc' },
    });

    for (const child of childTasks) {
      const run = await db.automationRun.create({
        data: {
          taskId: child.id,
          status: 'CANCELLED',
          triggeredBy: 'chain',
          errorMessage: `Chain cancelled: parent task failed: ${error}`,
          attempt: 1,
          maxAttempts: 1,
        },
      });

      SocketService.emitToUser(child.userId, 'automation:run-update', run);
    }
  }

  private static async _sendNotification(task: any, instance: any, status: string, error: string | null): Promise<void> {
    if (status === 'completed') {
      await NotificationService.notify(task.userId, 'task.completed', {
        task: task.name,
        instance: instance.name,
        instanceId: instance.id,
      });
    } else {
      await NotificationService.notify(task.userId, 'task.failed', {
        task: task.name,
        instance: instance.name,
        instanceId: instance.id,
        error: error || 'Unknown error',
      });
    }
  }

  private static async _updateRunStatus(runId: string, status: string, extra: any = {}): Promise<void> {
    await db.automationRun.update({
      where: { id: runId },
      data: { status, ...extra },
    });
  }

  private static async _addLog(runId: string | null, level: string, message: string): Promise<void> {
    if (!runId) return;
    const log = await db.automationLog.create({
      data: { runId, level, message },
    });

    // Emit real-time log update
    const run = await db.automationRun.findUnique({
      where: { id: runId },
      include: { task: { select: { userId: true, instanceId: true } } },
    });
    if (run?.task) {
      SocketService.emitToUser(run.task.userId, 'automation:log', log);
    }
  }

  private static async _failRun(runId: string, error: string): Promise<void> {
    await db.automationRun.update({
      where: { id: runId },
      data: { status: 'FAILED', errorMessage: error, finishedAt: new Date() },
    });
  }
}
