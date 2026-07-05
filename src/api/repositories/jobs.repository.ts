import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export interface ClaimedJobRow {
  id: string;
  queue_id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  worker_id: string;
  claimed_at: Date;
  lease_until: Date;
  batch_id: string | null;
  idempotency_key: string | null;
  retry_policy_id: string | null;
}

interface JobListFilter {
  status?: string;
  type?: string;
}

export const jobsRepository = {
  create(data: {
    id?: string;
    queueId: string;
    type: string;
    payload: Record<string, unknown>;
    priority: number;
    runAt: Date;
    status: 'queued' | 'pending';
    maxAttempts: number;
    retryPolicyId?: string;
    idempotencyKey?: string;
    batchId?: string;
    scheduledDefinitionId?: string;
    partitionKey?: number;
    createdBy?: string;
  }) {
    return prisma.job.create({ data: { ...data, payload: data.payload as Prisma.InputJsonValue } });
  },

  findById(id: string) {
    return prisma.job.findUnique({ where: { id }, include: { queue: { include: { project: true } } } });
  },

  findByIdempotencyKey(queueId: string, idempotencyKey: string) {
    return prisma.job.findUnique({ where: { queueId_idempotencyKey: { queueId, idempotencyKey } } });
  },

  async listForQueue(queueId: string, filter: JobListFilter, cursor?: string, limit = 25) {
    const where: Record<string, unknown> = { queueId };
    if (filter.status) where.status = filter.status;
    if (filter.type) where.type = filter.type;

    const rows = await prisma.job.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  },

  updateStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
    return prisma.job.update({ where: { id }, data: { status, ...extra } });
  },

  // ── Section 9.1: The Atomic Claim Query ────────────────────────────────────
  // WITH next_job AS (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE ...
  // Raw SQL is required here (per the SDS's own ADR, Section 2's tooling
  // rationale): Prisma's query builder cannot express SKIP LOCKED, and this is
  // the one query in the whole system where that matters. Includes the
  // Section 11.19 priority-aging term and the Section 11.2 optional partition
  // predicate.
  async claimNextJob(
    queueId: string,
    workerId: string,
    visibilityTimeoutSeconds: number,
    partitionKey?: number
  ): Promise<ClaimedJobRow | null> {
    const agingIntervalSeconds = 300; // AGING_INTERVAL_SECONDS (Section 11.19) — one priority point per 5 min waited

    const rows =
      partitionKey !== undefined
        ? await prisma.$queryRaw<ClaimedJobRow[]>`
            WITH next_job AS (
              SELECT id FROM jobs
              WHERE queue_id = ${queueId}::uuid
                AND status = 'queued'
                AND run_at <= now()
                AND partition_key = ${partitionKey}
              ORDER BY (priority + EXTRACT(EPOCH FROM (now() - run_at)) / ${agingIntervalSeconds}) DESC,
                       run_at ASC
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            UPDATE jobs
            SET status = 'claimed',
                worker_id = ${workerId}::uuid,
                claimed_at = now(),
                lease_until = now() + (${visibilityTimeoutSeconds} || ' seconds')::interval,
                attempt_count = attempt_count + 1
            FROM next_job
            WHERE jobs.id = next_job.id
            RETURNING jobs.id, jobs.queue_id, jobs.type, jobs.payload, jobs.status,
                      jobs.priority, jobs.attempt_count, jobs.max_attempts, jobs.worker_id,
                      jobs.claimed_at, jobs.lease_until, jobs.batch_id, jobs.idempotency_key,
                      jobs.retry_policy_id;
          `
        : await prisma.$queryRaw<ClaimedJobRow[]>`
            WITH next_job AS (
              SELECT id FROM jobs
              WHERE queue_id = ${queueId}::uuid
                AND status = 'queued'
                AND run_at <= now()
              ORDER BY (priority + EXTRACT(EPOCH FROM (now() - run_at)) / ${agingIntervalSeconds}) DESC,
                       run_at ASC
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            )
            UPDATE jobs
            SET status = 'claimed',
                worker_id = ${workerId}::uuid,
                claimed_at = now(),
                lease_until = now() + (${visibilityTimeoutSeconds} || ' seconds')::interval,
                attempt_count = attempt_count + 1
            FROM next_job
            WHERE jobs.id = next_job.id
            RETURNING jobs.id, jobs.queue_id, jobs.type, jobs.payload, jobs.status,
                      jobs.priority, jobs.attempt_count, jobs.max_attempts, jobs.worker_id,
                      jobs.claimed_at, jobs.lease_until, jobs.batch_id, jobs.idempotency_key,
                      jobs.retry_policy_id;
          `;
    return rows[0] ?? null;
  },

  // Section 9.1's WHERE clause also requires "queue.status = 'active'" and a
  // concurrency-slot check; those two are cheap, low-contention reads done
  // just before claiming (queue pause/slot state changes far less often than
  // jobs are claimed), rather than folded into the hot SKIP LOCKED statement
  // itself, keeping that statement's lock hold time minimal (Section 9.3).
  async queueIsClaimable(queueId: string): Promise<{ claimable: boolean; concurrencyLimit: number }> {
    const queue = await prisma.queue.findUnique({ where: { id: queueId } });
    if (!queue || queue.status !== 'active') return { claimable: false, concurrencyLimit: 0 };
    const runningCount = await prisma.job.count({ where: { queueId, status: 'running' } });
    return { claimable: runningCount < queue.concurrencyLimit, concurrencyLimit: queue.concurrencyLimit };
  },

  markRunning(id: string) {
    return prisma.job.update({ where: { id }, data: { status: 'running', startedAt: new Date() } });
  },

  markCompleted(id: string, result: unknown) {
    return prisma.job.update({
      where: { id },
      data: { status: 'completed', result: result as Prisma.InputJsonValue, completedAt: new Date() },
    });
  },

  markRetrying(id: string, runAt: Date, lastError: string) {
    return prisma.job.update({
      where: { id },
      data: { status: 'retrying', runAt, lastError, workerId: null, leaseUntil: null },
    });
  },

  markQueued(id: string) {
    return prisma.job.update({ where: { id }, data: { status: 'queued' } });
  },

  markDeadLetter(id: string, lastError: string) {
    return prisma.job.update({ where: { id }, data: { status: 'dead_letter', lastError, failedAt: new Date() } });
  },

  markCancelled(id: string, reason: string) {
    return prisma.job.update({ where: { id }, data: { status: 'cancelled', lastError: reason } });
  },

  extendLease(id: string, workerId: string, visibilityTimeoutSeconds: number) {
    // Guard clause per Figure 8.3: only extends a lease this worker still owns
    // and only while running — a job already reclaimed by the reaper silently
    // fails to extend rather than erroring.
    return prisma.job.updateMany({
      where: { id, workerId, status: 'running' },
      data: { leaseUntil: new Date(Date.now() + visibilityTimeoutSeconds * 1000) },
    });
  },

  // Section 8.5 — reaper sweep target set.
  findExpiredRunning(limit = 200) {
    return prisma.$queryRaw<{ id: string; attempt_count: number; max_attempts: number; queue_id: string; type: string; payload: unknown }[]>`
      SELECT id, attempt_count, max_attempts, queue_id, type, payload FROM jobs
      WHERE status = 'running' AND lease_until < now()
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit};
    `;
  },

  // ── DAG (Section 11.1) ──────────────────────────────────────────────────
  createDependency(jobId: string, dependsOnJobId: string) {
    return prisma.jobDependency.create({ data: { jobId, dependsOnJobId } });
  },

  dependenciesOf(jobId: string) {
    return prisma.jobDependency.findMany({ where: { jobId }, include: { dependsOn: true } });
  },

  dependentsOf(jobId: string) {
    return prisma.jobDependency.findMany({ where: { dependsOnJobId: jobId } });
  },

  async unsatisfiedDependencyCount(jobId: string): Promise<number> {
    const deps = await prisma.jobDependency.findMany({ where: { jobId }, include: { dependsOn: true } });
    return deps.filter((d: { dependsOn: { status: string } }) => d.dependsOn.status !== 'completed').length;
  },
};
