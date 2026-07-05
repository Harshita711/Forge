import { prisma } from '../../lib/prisma';
import { publishEvent } from '../../lib/eventBus';

export const queuesRepository = {
  create(data: {
    projectId: string;
    name: string;
    slug: string;
    priorityWeight: number;
    concurrencyLimit: number;
    visibilityTimeoutSeconds: number;
    partitionCount: number;
    defaultRetryPolicyId?: string;
  }) {
    return prisma.queue.create({ data });
  },

  findBySlugInProject(projectId: string, slug: string) {
    return prisma.queue.findFirst({ where: { projectId, slug } });
  },

  // Org-less lookup used by /v1/queues/:id — mirrors the projects pattern
  // (Section 14.1): resolve tenant from the row, then the service checks membership.
  findById(id: string) {
    return prisma.queue.findUnique({ where: { id }, include: { project: true } });
  },

  listForProject(projectId: string) {
    return prisma.queue.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  },

  update(
    id: string,
    data: Partial<{
      name: string;
      concurrencyLimit: number;
      priorityWeight: number;
      visibilityTimeoutSeconds: number;
      partitionCount: number;
      defaultRetryPolicyId: string | null;
    }>
  ) {
    return prisma.queue.update({ where: { id }, data });
  },

  async setStatus(id: string, status: 'active' | 'paused' | 'archived') {
    const queue = await prisma.queue.update({ where: { id }, data: { status } });
    await publishEvent({ type: 'queue:updated', queueId: id, payload: { status } });
    return queue;
  },

  countJobs(queueId: string) {
    return prisma.job.count({
      where: { queueId, status: { notIn: ['completed', 'cancelled', 'dead_letter'] } },
    });
  },

  delete(id: string) {
    return prisma.queue.delete({ where: { id } });
  },

  latestMetricsSnapshot(queueId: string) {
    return prisma.metricsSnapshot.findFirst({
      where: { scopeType: 'queue', scopeId: queueId },
      orderBy: { recordedAt: 'desc' },
    });
  },

  recentMetricsSnapshots(queueId: string, limit: number) {
    return prisma.metricsSnapshot.findMany({
      where: { scopeType: 'queue', scopeId: queueId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
  },

  // Live counts straight from jobs — what the queue overview cards and
  // dashboard expect, not the scheduler's periodic metrics_snapshots.
  async liveStatsForQueue(queueId: string) {
    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const [queuedCount, runningCount, completedCount, failedCount] = await Promise.all([
      prisma.job.count({ where: { queueId, status: { in: ['queued', 'pending', 'scheduled', 'retrying'] } } }),
      prisma.job.count({ where: { queueId, status: { in: ['running', 'claimed'] } } }),
      prisma.job.count({ where: { queueId, status: 'completed', completedAt: { gte: oneMinuteAgo } } }),
      prisma.job.count({ where: { queueId, status: 'dead_letter', failedAt: { gte: oneMinuteAgo } } }),
    ]);

    const latencyResult = await prisma.$queryRaw<{ avg_ms: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) AS avg_ms
      FROM jobs
      WHERE queue_id = ${queueId}::uuid AND status = 'completed' AND completed_at >= ${oneMinuteAgo};
    `;
    const avgLatencyMs = latencyResult[0]?.avg_ms ?? null;
    const totalRecent = completedCount + failedCount;
    const errorRate = totalRecent > 0 ? failedCount / totalRecent : 0;

    return {
      queuedCount,
      runningCount,
      completedCount,
      failedCount,
      throughputPerMin: completedCount,
      avgLatencyMs,
      errorRate,
      recordedAt: new Date(),
    };
  },
};
