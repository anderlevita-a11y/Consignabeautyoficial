import { EventEmitter } from 'events';

export interface SyncJob {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number; // 0 - 100
  currentStep: string;
  itemsProcessed: number;
  totalItemsFound: number;
  results?: {
    new: number;
    updated: number;
    normal: number;
    errors: number;
  };
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

class JobManager extends EventEmitter {
  private jobs: Map<string, SyncJob> = new Map();
  private activeJobId: string | null = null;

  public createJob(type: string = 'favorita-sync'): SyncJob {
    // If there is already an active running job, return it to prevent duplicate execution
    if (this.activeJobId) {
      const activeJob = this.jobs.get(this.activeJobId);
      if (activeJob && (activeJob.status === 'running' || activeJob.status === 'queued')) {
        return activeJob;
      }
    }

    const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newJob: SyncJob = {
      id,
      type,
      status: 'queued',
      progress: 0,
      currentStep: 'Enfileirado na fila de processamento em segundo plano...',
      itemsProcessed: 0,
      totalItemsFound: 0,
      startedAt: new Date().toISOString()
    };

    this.jobs.set(id, newJob);
    this.activeJobId = id;
    this.emit('job:created', newJob);

    // Clean up jobs older than 2 hours to avoid memory leaks
    this.pruneOldJobs();

    return newJob;
  }

  public updateJob(id: string, updates: Partial<SyncJob>) {
    const job = this.jobs.get(id);
    if (!job) return;

    Object.assign(job, updates);
    if (updates.status === 'completed' || updates.status === 'failed') {
      job.finishedAt = new Date().toISOString();
      if (this.activeJobId === id) {
        this.activeJobId = null;
      }
    }

    this.emit('job:updated', job);
  }

  public getJob(id: string): SyncJob | undefined {
    return this.jobs.get(id);
  }

  public getActiveOrLatestJob(): SyncJob | undefined {
    if (this.activeJobId) {
      return this.jobs.get(this.activeJobId);
    }
    // Return most recently created job
    const sorted = Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    return sorted[0];
  }

  private pruneOldJobs() {
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;
    for (const [id, job] of this.jobs.entries()) {
      if (job.status !== 'running' && job.status !== 'queued') {
        const jobTime = new Date(job.startedAt).getTime();
        if (now - jobTime > twoHours) {
          this.jobs.delete(id);
        }
      }
    }
  }
}

export const jobManager = new JobManager();
