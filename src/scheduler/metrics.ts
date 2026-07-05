import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

// Runs on the Scheduler (leader only, same as promotion/reaping) every
// METRICS_TICK_MS. One snapshot row per active queue per tick gives the
// dashboard's throughput/health charts (Section 13) a time series to plot
// without querying the much larger jobs/execution_events tables directly on
// every page load.
export async function runMetricsTick(): Promise<void> {
  const queues = await prisma.queue.findMany({ where: { status: { not: 'archived' } }, select: { id: true } });

  for (const queue of queues) {
    const [queuedCount, runningCount, completedCount, failedCount] = await Promise.all([
      prisma.job.count({ where: { queueId: queue.id, status: { in: ['queued', 'pending', 'scheduled', 'retrying'] } } }),
      prisma.job.count({ where: { queueId: queue.id, status: 'running' } }),
      prisma.job.count({ where: { queueId: queue.id, status: 'completed', completedAt: { gte: oneMinuteAgo() } } }),
      prisma.job.count({ where: { queueId: queue.id, status: 'dead_letter', failedAt: { gte: oneMinuteAgo() } } }),
    ]);

    const latencyResult = await prisma.$queryRaw<{ avg_ms: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000) AS avg_ms
      FROM jobs
      WHERE queue_id = ${queue.id}::uuid AND status = 'completed' AND completed_at >= ${oneMinuteAgo()};
    `;
    const avgLatencyMs = latencyResult[0]?.avg_ms ?? null;

    const totalRecent = completedCount + failedCount;
    const errorRate = totalRecent > 0 ? failedCount / totalRecent : 0;

    await prisma.metricsSnapshot.create({
      data: {
        scopeType: 'queue',
        scopeId: queue.id,
        queuedCount,
        runningCount,
        failedCount,
        completedCount,
        throughputPerMin: completedCount,
        avgLatencyMs,
        errorRate,
      },
    });
  }

  logger.debug({ queueCount: queues.length }, 'Recorded metrics snapshots');
}

function oneMinuteAgo(): Date {
  return new Date(Date.now() - 60_000);
}
