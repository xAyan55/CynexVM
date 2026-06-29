import { EventEmitter } from 'events';

export interface Job<T = any> {
  id: string;
  name: string;
  data: T;
  progress: number;
  status: 'pending' | 'active' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  failedReason?: string;
  result?: any;
  createdAt: Date;
  updatedAt: Date;
}

export type JobProcessor = (job: Job) => Promise<any>;

class InMemoryQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private processors: Map<string, JobProcessor> = new Map();
  private activeJobsCount = 0;

  constructor() {
    super();
    // Start polling processing loop
    setInterval(() => this.processNext(), 1000);
  }

  public registerProcessor(queueName: string, processor: JobProcessor) {
    this.processors.set(queueName, processor);
  }

  public async add(queueName: string, name: string, data: any, maxAttempts = 3): Promise<Job> {
    const job: Job = {
      id: Math.random().toString(36).substring(2, 15),
      name,
      data,
      progress: 0,
      status: 'pending',
      attempts: 0,
      maxAttempts,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.jobs.set(job.id, job);
    console.log(`[Queue: ${queueName}] Enqueued job ${name} (${job.id})`);
    
    // Trigger loop immediately
    process.nextTick(() => this.processNext());
    return job;
  }

  public getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  private async processNext() {
    if (this.activeJobsCount >= 5) return; // Limit concurrency to 5 workers

    const pendingJobEntry = Array.from(this.jobs.entries()).find(
      ([_, job]) => job.status === 'pending'
    );

    if (!pendingJobEntry) return;

    const [id, job] = pendingJobEntry;
    const processor = this.processors.get(job.name); // Using job name as worker selector

    if (!processor) {
      console.warn(`No registered worker processor for job name: ${job.name}`);
      job.status = 'failed';
      job.failedReason = 'No processor found';
      return;
    }

    job.status = 'active';
    job.attempts += 1;
    job.updatedAt = new Date();
    this.activeJobsCount += 1;

    try {
      console.log(`[Queue] Processing job ${job.name} (${job.id}) - Attempt ${job.attempts}/${job.maxAttempts}`);
      const result = await processor(job);
      job.status = 'completed';
      job.result = result;
      job.progress = 100;
      console.log(`[Queue] Job ${job.name} (${job.id}) completed successfully.`);
    } catch (err: any) {
      console.error(`[Queue] Job ${job.name} (${job.id}) failed:`, err.message);
      job.failedReason = err.message;
      
      if (job.attempts < job.maxAttempts) {
        job.status = 'pending'; // Re-queue for retry
      } else {
        job.status = 'failed';
      }
    } finally {
      job.updatedAt = new Date();
      this.activeJobsCount -= 1;
      // Loop again
      this.processNext();
    }
  }
}

export class JobService {
  private static instance = new InMemoryQueue();

  /**
   * Enqueues a task for background worker consumption.
   */
  public static async enqueue(jobName: string, data: any, maxAttempts = 3): Promise<Job> {
    return this.instance.add('default', jobName, data, maxAttempts);
  }

  /**
   * Registers a worker callback block to process tasks matching a jobName.
   */
  public static registerWorker(jobName: string, processor: JobProcessor): void {
    this.instance.registerProcessor(jobName, processor);
  }

  /**
   * Fetches status details of a active or historical job.
   */
  public static getJobStatus(jobId: string): Job | undefined {
    return this.instance.getJob(jobId);
  }
}
