import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { cronNextFireTime } from '../domain/cron';
import { publishEvent } from '../lib/eventBus';
import { SCHEDULER_CONFIG } from './config';

interface DueDefinitionRow {
  id: string;
  queue_id: string;
  job_type: string;
  payload_template: Record<string, unknown>;
  schedule_type: string;
  cron_expression: string | null;
  timezone: string;
}

async function resolveMaxAttempts(queueId: string): Promise<number> {
  // Section 7.2's resolveMaxAttempts(def): falls back to the queue's default
  // retry policy's max_attempts, then a system default, same resolution
  // chain as the worker's own resolveEffectiveRetryPolicy (Section 10.1).
  const queue = await prisma.queue.findUnique({ where: { id: queueId } });
  if (queue?.defaultRetryPolicyId) {
    const policy = await prisma.retryPolicy.findUnique({ where: { id: queue.defaultRetryPolicyId } });
    if (policy) return policy.maxAttempts;
  }
  return 5;
}

// Figure 7.1 — promotes due scheduled_definitions into concrete job rows,
// batched (LIMIT 200) so one tick's transaction size is bounded even if
// thousands of cron definitions share a top-of-hour schedule.
export async function runPromotionTick(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const due = await tx.$queryRaw<DueDefinitionRow[]>`
      SELECT id, queue_id, job_type, payload_template, schedule_type, cron_expression, timezone
      FROM scheduled_definitions
      WHERE next_run_at <= now() AND is_active = true
      ORDER BY next_run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${SCHEDULER_CONFIG.promotionBatchSize};
    `;

    for (const def of due) {
      const maxAttempts = await resolveMaxAttempts(def.queue_id);
      const created = await tx.job.create({
        data: {
          queueId: def.queue_id,
          type: def.job_type,
          payload: def.payload_template as Prisma.InputJsonValue,
          status: 'queued',
          runAt: new Date(),
          maxAttempts,
          scheduledDefinitionId: def.id,
        },
      });
      await tx.executionEvent.create({
        data: { jobId: created.id, eventType: 'created', attemptNumber: 0, metadata: { fromScheduledDefinition: def.id } },
      });
      await tx.executionEvent.create({
        data: { jobId: created.id, eventType: 'queued', attemptNumber: 0, metadata: { reason: 'scheduled_definition_promoted' } },
      });
      // Raw tx.executionEvent.create (not executionEventsRepository.record) is
      // used above because Prisma's interactive transaction client can't be
      // threaded through the shared repository — so this path has to publish
      // its own realtime notice too, or a scheduler-created job would never
      // show up live on the queue/dashboard views the way an API-submitted one does.
      await publishEvent({
        type: 'queue:updated',
        queueId: def.queue_id,
        jobId: created.id,
        payload: { eventType: 'queued', reason: 'scheduled_definition_promoted', scheduledDefinitionId: def.id },
      });

      if (def.schedule_type === 'cron' && def.cron_expression) {
        const nextRunAt = cronNextFireTime(def.cron_expression, def.timezone);
        await tx.scheduledDefinition.update({ where: { id: def.id }, data: { nextRunAt } });
      } else {
        // 'delayed', one-shot — Figure 7.1: deactivate rather than delete, so
        // it remains visible in the dashboard's schedule history.
        await tx.scheduledDefinition.update({ where: { id: def.id }, data: { isActive: false } });
      }
    }

    if (due.length > 0) {
      logger.info({ count: due.length }, 'Promoted scheduled definitions to jobs');
    }
  });

  // Section 10.3/6 — "reaper/scheduler tick, or the job's own delayed
  // re-check" for individual job rows waiting out a retry delay or an
  // early-satisfied DAG dependency whose run_at hadn't arrived yet.
  const dueRows = await prisma.job.findMany({
    where: { status: { in: ['retrying', 'scheduled'] }, runAt: { lte: new Date() } },
    select: { id: true, queueId: true },
  });

  if (dueRows.length > 0) {
    await prisma.job.updateMany({
      where: { id: { in: dueRows.map((r: { id: string }) => r.id) } },
      data: { status: 'queued' },
    });

    const affectedQueueIds = new Set(dueRows.map((r: { queueId: string }) => r.queueId));
    await Promise.all(
      Array.from(affectedQueueIds).map((queueId) =>
        publishEvent({ type: 'queue:updated', queueId, payload: { eventType: 'queued', reason: 'promotion_tick' } })
      )
    );

    logger.debug({ count: dueRows.length }, 'Promoted retrying/scheduled jobs back to queued');
  }
}