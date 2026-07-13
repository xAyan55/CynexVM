import { db } from '../../db';
import { ConnectionManager } from './ConnectionManager';

export class JobManager {
  static async enqueue(nodeId: string | null, type: string, payload: any, options?: { timeout?: number; maxRetries?: number }): Promise<any> {
    const job = await db.nodeJob.create({
      data: {
        nodeId: nodeId || '',
        type,
        payload: JSON.stringify(payload),
        status: 'queued',
        timeout: options?.timeout || 300000,
        maxRetries: options?.maxRetries || 3
      }
    });

    this.dispatch(job);
    return job;
  }

  static async dispatch(job: any): Promise<void> {
    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;

    const sent = ConnectionManager.send(job.nodeId, {
      type: 'job',
      jobId: job.id,
      jobType: job.type,
      payload
    });

    if (sent) {
      await db.nodeJob.update({
        where: { id: job.id },
        data: { status: 'running', startedAt: new Date() }
      });
    }
  }

  static async handleResponse(msg: any): Promise<void> {
    const { jobId } = msg;

    switch (msg.type) {
      case 'job_progress':
        await db.nodeJob.update({
          where: { id: jobId },
          data: { progress: msg.progress }
        });
        break;

      case 'job_stdout':
      case 'job_stderr':
        break;

      case 'job_complete':
        await db.nodeJob.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            progress: 100,
            finishedAt: new Date(),
            result: JSON.stringify({
              exitCode: msg.exitCode,
              duration: msg.duration,
              ...(msg.result || {})
            })
          }
        });
        break;

      case 'job_failed':
        await db.nodeJob.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            finishedAt: new Date(),
            error: msg.error
          }
        });
        break;

      case 'job_cancelled':
        await db.nodeJob.update({
          where: { id: jobId },
          data: { status: 'cancelled', finishedAt: new Date() }
        });
        break;
    }
  }

  static async list(nodeId?: string, status?: string, limit = 50): Promise<any[]> {
    const where: any = {};
    if (nodeId) where.nodeId = nodeId;
    if (status) where.status = status;

    return db.nodeJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  static async get(jobId: string): Promise<any> {
    return db.nodeJob.findUnique({ where: { id: jobId } });
  }

  static async cancel(jobId: string): Promise<void> {
    const job = await db.nodeJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return;

    ConnectionManager.send(job.nodeId, { type: 'job_cancel', jobId });

    await db.nodeJob.update({
      where: { id: jobId },
      data: { status: 'cancelled', finishedAt: new Date() }
    });
  }
}
