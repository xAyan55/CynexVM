export interface TaskLog {
  timestamp: Date;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export interface Task {
  id: string;
  name: string; // e.g. "Deploy VPS", "Backup Container"
  vmid?: number;
  instanceId?: string;
  userId?: string;
  username: string;
  nodeName: string;
  status: 'queued' | 'validating' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0 to 100
  currentStage: string;
  currentStep: string;
  durationMs: number;
  logs: TaskLog[];
  failedReason?: string;
  retryCount: number;
  createdAt: Date;
  completedAt?: Date;
}

export class TaskService {
  private static tasks: Map<string, Task> = new Map();

  /**
   * Spawns and registers a new tracking task context
   */
  public static createTask(params: {
    name: string;
    vmid?: number;
    instanceId?: string;
    userId?: string;
    username: string;
    nodeName: string;
  }): Task {
    const task: Task = {
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      name: params.name,
      vmid: params.vmid,
      instanceId: params.instanceId,
      userId: params.userId,
      username: params.username,
      nodeName: params.nodeName,
      status: 'queued',
      progress: 0,
      currentStage: 'Queued',
      currentStep: 'Queueing task in scheduler',
      durationMs: 0,
      logs: [{ timestamp: new Date(), level: 'info', message: 'Task enqueued in background scheduler.' }],
      retryCount: 0,
      createdAt: new Date()
    };
    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * Appends a log line and updates progress values
   */
  public static updateTask(
    taskId: string,
    updates: {
      status?: Task['status'];
      progress?: number;
      currentStage?: string;
      currentStep?: string;
      logMessage?: string;
      logLevel?: TaskLog['level'];
      failedReason?: string;
    }
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    if (updates.status) task.status = updates.status;
    if (updates.progress !== undefined) task.progress = updates.progress;
    if (updates.currentStage) task.currentStage = updates.currentStage;
    if (updates.currentStep) task.currentStep = updates.currentStep;
    if (updates.failedReason) task.failedReason = updates.failedReason;

    if (updates.logMessage) {
      task.logs.push({
        timestamp: new Date(),
        level: updates.logLevel || 'info',
        message: updates.logMessage
      });
      console.log(`[Task:${task.id}] [${task.currentStage}] ${updates.logMessage}`);
    }

    task.durationMs = Date.now() - task.createdAt.getTime();
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      task.completedAt = new Date();

      // Hook into NotificationService to spawn system notifications
      const targetUserId = task.userId;
      const status = task.status;
      const name = task.name;
      const failedReason = task.failedReason;
      process.nextTick(async () => {
        try {
          const { NotificationService } = require('./notification/notificationService');
          if (targetUserId) {
            if (status === 'completed') {
              await NotificationService.notify(targetUserId, 'task.completed', { task: name });
            } else if (status === 'failed') {
              await NotificationService.notify(targetUserId, 'task.failed', { task: name, error: failedReason || 'Unknown error' });
            }
          }
        } catch (_) {}
      });
    }

    // Emit real-time Socket.IO progress event
    process.nextTick(() => {
      try {
        const { SocketService } = require('./socketService');
        const payload = {
          id: task.id,
          status: task.status,
          progress: task.progress,
          currentStage: task.currentStage,
          currentStep: task.currentStep,
          failedReason: task.failedReason,
          durationMs: task.durationMs,
          userId: task.userId,
        };
        SocketService.emitToAll('task:progress', payload);
        if (task.userId) {
          SocketService.emitToUser(task.userId, 'task:progress', payload);
        }
      } catch (_) {}
    });

    this.tasks.set(taskId, task);
  }

  /**
   * Retrieves a specific task
   */
  public static getTask(taskId: string): Task | undefined {
    const task = this.tasks.get(taskId);
    if (task) {
      task.durationMs = task.completedAt
        ? task.completedAt.getTime() - task.createdAt.getTime()
        : Date.now() - task.createdAt.getTime();
    }
    return task;
  }

  /**
   * Lists all logged tasks (Admin gets all, Customer gets theirs)
   */
  public static listTasks(userId?: string, isAdmin = false): Task[] {
    const list = Array.from(this.tasks.values());
    list.forEach(t => {
      t.durationMs = t.completedAt
        ? t.completedAt.getTime() - t.createdAt.getTime()
        : Date.now() - t.createdAt.getTime();
    });

    if (isAdmin) return list;
    return list.filter(t => t.userId === userId);
  }
}
