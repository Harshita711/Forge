import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { publishEvent } from '../../lib/eventBus';

export type ExecutionEventType =
  | 'created'
  | 'queued'
  | 'claimed'
  | 'started'
  | 'heartbeat'
  | 'log'
  | 'retry'
  | 'completed'
  | 'failed'
  | 'recovered'
  | 'cancelled'
  | 'dead_lettered';

export const executionEventsRepository = {
  async record(
    jobId: string,
    eventType: ExecutionEventType,
    attemptNumber: number,
    metadata: Record<string, unknown> = {},
    workerId?: string,
    queueId?: string
  ) {
    const event = await prisma.executionEvent.create({
      data: { jobId, eventType, attemptNumber, metadata: metadata as Prisma.InputJsonValue, workerId },
    });
    await publishEvent({
      type: 'job:updated',
      jobId,
      queueId,
      workerId,
      payload: { eventType, attemptNumber, metadata },
    });
    if (queueId) {
      await publishEvent({ type: 'queue:updated', queueId, jobId, payload: { eventType, attemptNumber } });
    }
    if (eventType === 'dead_lettered') {
      await publishEvent({ type: 'dlq:new', jobId, queueId, payload: {} });
    }
    return event;
  },

  timelineForJob(jobId: string) {
    return prisma.executionEvent.findMany({
      where: { jobId },
      orderBy: { occurredAt: 'asc' },
    });
  },
};
