import os from 'os';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { jobsRepository } from '../api/repositories/jobs.repository';
import { workersRepository } from '../api/repositories/workers.repository';
import { executeJob } from './execute';
import { WORKER_CONFIG, pollJitterMs } from './config';
import { acquireLock, releaseLock } from '../lib/redisLock';

interface QueueInfo {
  id: string;
  partitionCount: number;
}

export class WorkerRuntime {
  private workerId!: string;
  private capacity: number;
  private activeSlots = new Set<string>(); // job IDs currently executing
  private pollTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private stopping = false;
  private stopped = false;

  // Queues this worker will poll — polls every active queue round-robin;
  // Section 11.13's smarter "weighted by priority_weight across many
  // queues" scheduling is a refinement of this same loop, not a different
  // mechanism.
  private queues: QueueInfo[] = [];

  constructor(capacity: number = WORKER_CONFIG.capacity) {
    this.capacity = capacity;
  }

  async start(): Promise<void> {
    const worker = await workersRepository.registerOnStart(os.hostname(), this.capacity);
    this.workerId = worker.id;
    logger.info({ workerId: this.workerId, capacity: this.capacity }, 'Worker started');

    await this.refreshQueueList();
    this.scheduleNextPoll(0);
    this.heartbeatTimer = setInterval(() => this.heartbeat(), WORKER_CONFIG.heartbeatIntervalMs);

    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }

  private async refreshQueueList(): Promise<void> {
    const queues = await prisma.queue.findMany({
      where: { status: 'active' },
      select: { id: true, partitionCount: true },
    });
    this.queues = queues.map((q: { id: string; partitionCount: number }) => ({ id: q.id, partitionCount: q.partitionCount }));
  }

  private scheduleNextPoll(delayMs: number): void {
    if (this.stopping) return;
    this.pollTimer = setTimeout(() => this.pollOnce(), delayMs);
  }

  // Figure 8.1 — main loop, one tick: while activeSlots < capacity, try to
  // claim from the next queue in round-robin order. Section 11.2: for a
  // queue configured with partition_count > 1, this worker instance tries to
  // acquire a short-lived lock:partition:{queueId}:{n} for each partition
  // before polling it — "partitions, not individual jobs, are the unit of
  // exclusivity between worker groups." A partition another worker already
  // holds the lock for is simply skipped this tick, not contended for.
  private async pollOnce(): Promise<void> {
    if (this.stopping) return;
    try {
      await this.refreshQueueList();

      let claimedAnything = false;
      for (const queue of this.queues) {
        if (this.activeSlots.size >= this.capacity) break;

        if (queue.partitionCount <= 1) {
          claimedAnything = (await this.drainQueue(queue.id)) || claimedAnything;
          continue;
        }

        for (let partition = 0; partition < queue.partitionCount; partition += 1) {
          if (this.activeSlots.size >= this.capacity) break;
          const lockKey = `lock:partition:${queue.id}:${partition}`;
          // TTL just above one poll interval: a worker that dies mid-tick
          // releases the partition to another group within one cycle rather
          // than starving it for the lock's full lifetime.
          const lock = await acquireLock(lockKey, WORKER_CONFIG.pollIntervalMs * 3);
          if (!lock) continue; // another worker group owns this partition right now
          try {
            claimedAnything = (await this.drainQueue(queue.id, partition)) || claimedAnything;
          } finally {
            await releaseLock(lock);
          }
        }
      }

      // Section 8.1: poll faster right after finding work (short backlog),
      // slower plus jitter when idle, to avoid a thundering herd against Postgres.
      this.scheduleNextPoll(claimedAnything ? 100 : WORKER_CONFIG.pollIntervalMs + pollJitterMs());
    } catch (err) {
      logger.error({ err }, 'Poll tick failed');
      this.scheduleNextPoll(WORKER_CONFIG.pollIntervalMs + pollJitterMs());
    }
  }

  // Claims and dispatches as many jobs as this worker has free slots for,
  // from one (queue, partition) pair, stopping the moment a claim returns
  // nothing (queue/partition genuinely drained for now).
  private async drainQueue(queueId: string, partitionKey?: number): Promise<boolean> {
    let claimedAny = false;
    while (this.activeSlots.size < this.capacity) {
      const { claimable } = await jobsRepository.queueIsClaimable(queueId);
      if (!claimable) break;

      const claimed = await jobsRepository.claimNextJob(
        queueId,
        this.workerId,
        WORKER_CONFIG.defaultVisibilityTimeoutSeconds,
        partitionKey
      );
      if (!claimed) break;

      claimedAny = true;
      this.activeSlots.add(claimed.id);
      executeJob(claimed, this.workerId)
        .catch((err) => logger.error({ err, jobId: claimed.id }, 'Unhandled error executing job'))
        .finally(() => this.activeSlots.delete(claimed.id));
    }
    return claimedAny;
  }

  // Figure 8.3 — heartbeat: updates workers.last_heartbeat_at / active_slots,
  // appends a worker_heartbeats sample, and extends the lease on every job
  // this worker currently holds (only rows it still owns — Section 9.3).
  private async heartbeat(): Promise<void> {
    try {
      await workersRepository.heartbeat(this.workerId, this.activeSlots.size);
      await workersRepository.recordHeartbeatSample(this.workerId, this.activeSlots.size);
      await Promise.all(
        Array.from(this.activeSlots).map((jobId) =>
          jobsRepository.extendLease(jobId, this.workerId, WORKER_CONFIG.defaultVisibilityTimeoutSeconds)
        )
      );
    } catch (err) {
      logger.error({ err, workerId: this.workerId }, 'Heartbeat failed');
    }
  }

  // Figure 8.4 — graceful shutdown: stop claiming immediately, wait up to
  // SHUTDOWN_GRACE_PERIOD_MS for in-flight jobs to finish naturally, and
  // never force-fail a job still running when the grace period elapses —
  // leave its lease to expire and let the reaper's crash-recovery path
  // (Section 8.5) handle it, since forcing a 'failed' status here could
  // duplicate an already-completed side effect on retry (Section 8.4's own rationale).
  private async shutdown(signal: string): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    logger.info({ signal, workerId: this.workerId }, 'Graceful shutdown initiated — no longer claiming new jobs');

    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await workersRepository.setStatus(this.workerId, 'draining');

    const deadline = Date.now() + WORKER_CONFIG.shutdownGracePeriodMs;
    while (this.activeSlots.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (this.activeSlots.size > 0) {
      logger.warn(
        { workerId: this.workerId, count: this.activeSlots.size },
        'Forced shutdown with jobs still running — leaving their leases to expire naturally'
      );
    }

    await workersRepository.setStatus(this.workerId, 'offline');
    await prisma.$disconnect();
    this.stopped = true;
    process.exit(0);
  }

  isStopped(): boolean {
    return this.stopped;
  }
}
