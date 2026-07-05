import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { executionEventsRepository } from '../api/repositories/executionEvents.repository';
import { dlqRepository } from '../api/repositories/dlq.repository';
import { workersRepository } from '../api/repositories/workers.repository';
import { cascadeCancelDependents } from '../api/services/jobs.service';
import { publishEvent } from '../lib/eventBus';
import { SCHEDULER_CONFIG } from './config';

interface ExpiredJobRow {
  id: string;
  attempt_count: number;
  max_attempts: number;
  queue_id: string;
  type: string;
  payload: Record<string, unknown>;
}

// Figure 8.5, first half: any 'running' job whose lease expired is either
// recovered (attempts remain) or dead-lettered (exhausted) — this is the
// ONLY path that ever moves a job from running back toward queued (Section
// 6.3's guard condition: a live worker never re-queues its own job).
export async function runReaperTick(): Promise<void> {
  const expired = await prisma.$queryRaw<ExpiredJobRow[]>`
    SELECT id, attempt_count, max_attempts, queue_id, type, payload FROM jobs
    WHERE status = 'running' AND lease_until < now()
    FOR UPDATE SKIP LOCKED
    LIMIT ${SCHEDULER_CONFIG.reaperBatchSize};
  `;

  for (const job of expired) {
    if (job.attempt_count < job.max_attempts) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'queued', workerId: null, leaseUntil: null, attemptCount: { increment: 1 } },
      });
      await executionEventsRepository.record(
        job.id,
        'recovered',
        job.attempt_count,
        { reason: 'lease_expired' },
        undefined,
        job.queue_id
      );
      logger.warn({ jobId: job.id }, 'Recovered job from an expired lease (presumed crashed worker)');
    } else {
      await prisma.job.update({ where: { id: job.id }, data: { status: 'dead_letter', failedAt: new Date() } });
      await dlqRepository.create({
        originalJobId: job.id,
        queueId: job.queue_id,
        type: job.type,
        payload: job.payload,
        failureReason: 'lease_expired_max_attempts',
        attemptCount: job.attempt_count,
      });
      await executionEventsRepository.record(
        job.id,
        'dead_lettered',
        job.attempt_count,
        { reason: 'lease_expired_max_attempts' },
        undefined,
        job.queue_id
      );
      await cascadeCancelDependents(job.id, 'parent_dead_lettered_lease_expired');
      logger.warn({ jobId: job.id }, 'Dead-lettered job after lease expiry with no attempts remaining');
    }
  }

  // Figure 8.5, second half: mark workers offline once their heartbeat is
  // stale — independent of whether they currently hold any jobs (those are
  // handled by the branch above via their own lease expiry).
  const stale = await workersRepository.findStale(SCHEDULER_CONFIG.workerTimeoutMs);
  if (stale.length > 0) {
    await workersRepository.markOffline(stale.map((w: { id: string }) => w.id));
    await Promise.all(
      stale.map((w: { id: string }) =>
        publishEvent({ type: 'worker:updated', workerId: w.id, payload: { status: 'offline', reason: 'stale_heartbeat' } })
      )
    );
    logger.warn({ count: stale.length }, 'Marked stale workers offline');
  }
}