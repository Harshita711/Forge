import { prisma } from '../../lib/prisma';

// Every method here queries jobs/queues/workers directly (Prisma groupBy or
// raw SQL) rather than reading metrics_snapshots. The snapshot table (Section
// 13's original design) is a fixed-cadence approximation written once per
// METRICS_TICK_MS by the scheduler — fine for a sparkline, wrong for a
// dashboard headline number a person expects to match reality the instant
// they act on it (e.g. right after cancelling a job). Live aggregation costs
// a handful of indexed queries per page load, which is the correct trade for
// a dashboard that isn't polled every second.

const TERMINAL_STATUSES = ['completed', 'cancelled', 'dead_letter'] as const;

export interface StatusCounts {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  retrying: number;
  pending: number;
  scheduled: number;
  cancelled: number;
  total: number;
}

function emptyStatusCounts(): StatusCounts {
  return { queued: 0, running: 0, completed: 0, failed: 0, retrying: 0, pending: 0, scheduled: 0, cancelled: 0, total: 0 };
}

// jobs.status values that map to a "failed" headline bucket for dashboard
// purposes (Section 6's dead_letter is the terminal failure state; a job
// merely 'retrying' is not yet a failure).
function bucketFor(status: string): keyof StatusCounts | null {
  switch (status) {
    case 'queued':
      return 'queued';
    case 'running':
    case 'claimed':
      return 'running';
    case 'completed':
      return 'completed';
    case 'dead_letter':
      return 'failed';
    case 'retrying':
      return 'retrying';
    case 'pending':
      return 'pending';
    case 'scheduled':
      return 'scheduled';
    case 'cancelled':
      return 'cancelled';
    default:
      return null;
  }
}

export const dashboardRepository = {
  async statusCountsForProject(projectId: string): Promise<StatusCounts> {
    const rows = await prisma.job.groupBy({
      by: ['status'],
      where: { queue: { projectId } },
      _count: { _all: true },
    });
    const counts = emptyStatusCounts();
    for (const row of rows) {
      const bucket = bucketFor(row.status);
      if (bucket) counts[bucket] += row._count._all;
      counts.total += row._count._all;
    }
    return counts;
  },

  async statusCountsForQueue(queueId: string): Promise<StatusCounts> {
    const rows = await prisma.job.groupBy({
      by: ['status'],
      where: { queueId },
      _count: { _all: true },
    });
    const counts = emptyStatusCounts();
    for (const row of rows) {
      const bucket = bucketFor(row.status);
      if (bucket) counts[bucket] += row._count._all;
      counts.total += row._count._all;
    }
    return counts;
  },

  // Per-queue breakdown for the dashboard's "by queue" table — one groupBy
  // covering every queue in the project instead of N+1 per-queue queries.
  async statusCountsByQueue(projectId: string): Promise<Record<string, StatusCounts>> {
    const rows = await prisma.job.groupBy({
      by: ['queueId', 'status'],
      where: { queue: { projectId } },
      _count: { _all: true },
    });
    const byQueue: Record<string, StatusCounts> = {};
    for (const row of rows) {
      if (!byQueue[row.queueId]) byQueue[row.queueId] = emptyStatusCounts();
      const bucket = bucketFor(row.status);
      if (bucket) byQueue[row.queueId][bucket] += row._count._all;
      byQueue[row.queueId].total += row._count._all;
    }
    return byQueue;
  },

  // Completed-jobs-per-minute time series over the trailing window — the
  // dashboard's throughput chart. date_trunc buckets need raw SQL; Prisma's
  // query builder has no truncation/grouping-by-expression support.
  async throughputSeries(projectId: string, minutes = 30): Promise<{ bucket: string; count: number }[]> {
    const rows = await prisma.$queryRaw<{ bucket: Date; count: bigint }[]>`
      SELECT date_trunc('minute', j.completed_at) AS bucket, COUNT(*)::bigint AS count
      FROM jobs j
      JOIN queues q ON q.id = j.queue_id
      WHERE q.project_id = ${projectId}::uuid
        AND j.status = 'completed'
        AND j.completed_at >= now() - (${minutes} || ' minutes')::interval
      GROUP BY bucket
      ORDER BY bucket ASC;
    `;
    return rows.map((r) => ({ bucket: r.bucket.toISOString(), count: Number(r.count) }));
  },

  // Average / p50 / p95 wall-clock processing time (started_at -> completed_at)
  // over the trailing window, in milliseconds.
  async processingTime(
    projectId: string,
    windowMinutes = 60
  ): Promise<{ avgMs: number | null; p50Ms: number | null; p95Ms: number | null; sampleCount: number }> {
    const rows = await prisma.$queryRaw<
      { avg_ms: number | null; p50_ms: number | null; p95_ms: number | null; sample_count: bigint }[]
    >`
      SELECT
        AVG(EXTRACT(EPOCH FROM (j.completed_at - j.started_at)) * 1000) AS avg_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (j.completed_at - j.started_at)) * 1000) AS p50_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (j.completed_at - j.started_at)) * 1000) AS p95_ms,
        COUNT(*)::bigint AS sample_count
      FROM jobs j
      JOIN queues q ON q.id = j.queue_id
      WHERE q.project_id = ${projectId}::uuid
        AND j.status = 'completed'
        AND j.started_at IS NOT NULL
        AND j.completed_at >= now() - (${windowMinutes} || ' minutes')::interval;
    `;
    const row = rows[0];
    return {
      avgMs: row?.avg_ms ?? null,
      p50Ms: row?.p50_ms ?? null,
      p95Ms: row?.p95_ms ?? null,
      sampleCount: row ? Number(row.sample_count) : 0,
    };
  },

  // Retry activity: how many jobs are mid-backoff right now, how many
  // eventually succeeded only after at least one retry, and the mean
  // attempt count across everything ever run in this project.
  async retryStats(
    projectId: string
  ): Promise<{ currentlyRetrying: number; recoveredAfterRetry: number; avgAttempts: number }> {
    const rows = await prisma.$queryRaw<
      { currently_retrying: bigint; recovered_after_retry: bigint; avg_attempts: number | null }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE j.status = 'retrying')::bigint AS currently_retrying,
        COUNT(*) FILTER (WHERE j.status = 'completed' AND j.attempt_count > 1)::bigint AS recovered_after_retry,
        COALESCE(AVG(j.attempt_count), 0) AS avg_attempts
      FROM jobs j
      JOIN queues q ON q.id = j.queue_id
      WHERE q.project_id = ${projectId}::uuid;
    `;
    const row = rows[0];
    return {
      currentlyRetrying: row ? Number(row.currently_retrying) : 0,
      recoveredAfterRetry: row ? Number(row.recovered_after_retry) : 0,
      avgAttempts: row?.avg_attempts ?? 0,
    };
  },

  async dlqCountForProject(projectId: string) {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM dead_letter_queue d
      JOIN queues q ON q.id = d.queue_id
      WHERE q.project_id = ${projectId}::uuid AND d.resolved = false;
    `;
    return Number(rows[0]?.count ?? 0);
  },

  queueCountForProject(projectId: string) {
    return prisma.queue.count({ where: { projectId, status: { not: 'archived' } } });
  },

  // Workers are cluster-wide infrastructure with no project/organization FK
  // (Section 4.11) — utilization is necessarily a platform-wide figure, not
  // scoped to the project being viewed, same scoping the standalone Workers
  // page already uses.
  async clusterUtilization(): Promise<{
    totalWorkers: number;
    onlineCount: number;
    drainingCount: number;
    offlineCount: number;
    totalCapacity: number;
    totalActiveSlots: number;
    utilization: number;
  }> {
    const workers = await prisma.worker.findMany({ select: { status: true, capacity: true, activeSlots: true } });
    const onlineOrDraining = workers.filter((w) => w.status !== 'offline');
    const totalCapacity = onlineOrDraining.reduce((sum, w) => sum + w.capacity, 0);
    const totalActiveSlots = onlineOrDraining.reduce((sum, w) => sum + w.activeSlots, 0);
    return {
      totalWorkers: workers.length,
      onlineCount: workers.filter((w) => w.status === 'online').length,
      drainingCount: workers.filter((w) => w.status === 'draining').length,
      offlineCount: workers.filter((w) => w.status === 'offline').length,
      totalCapacity,
      totalActiveSlots,
      utilization: totalCapacity > 0 ? totalActiveSlots / totalCapacity : 0,
    };
  },

  recentActivity(projectId: string, limit = 20) {
    return prisma.executionEvent.findMany({
      where: { job: { queue: { projectId } } },
      orderBy: { occurredAt: 'desc' },
      take: limit,
      include: { job: { select: { id: true, type: true, queueId: true } } },
    });
  },
};

export { TERMINAL_STATUSES };