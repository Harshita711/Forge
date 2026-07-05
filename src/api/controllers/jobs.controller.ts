import { Request, Response } from 'express';
import { CreateJobSchema, JobQuerySchema } from '../../domain/schemas';
import { jobsService } from '../services/jobs.service';
import { queuesService } from '../services/queues.service';
import { AppError } from '../../domain/errors';
import { hasEffectivePermission } from '../services/rbacResolution';

function toDto(j: {
  id: string;
  type: string;
  payload: unknown;
  status: string;
  priority: number;
  runAt: Date;
  attemptCount: number;
  maxAttempts: number;
  workerId: string | null;
  claimedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  result: unknown;
  createdAt: Date;
}) {
  return {
    id: j.id,
    type: j.type,
    payload: j.payload,
    status: j.status,
    priority: j.priority,
    runAt: j.runAt,
    attemptCount: j.attemptCount,
    maxAttempts: j.maxAttempts,
    workerId: j.workerId,
    claimedAt: j.claimedAt,
    startedAt: j.startedAt,
    completedAt: j.completedAt,
    failedAt: j.failedAt,
    lastError: j.lastError,
    result: j.result,
    createdAt: j.createdAt,
  };
}

export const jobsController = {
  async create(req: Request, res: Response) {
    // Queue must belong to a project the caller can see — queuesService
    // resolves tenant from the queue row itself (Section 14.1 pattern).
    const { queue, membership } = await queuesService.getForUser(req.params.id, req.user!.sub);
    if (!await hasEffectivePermission(membership, 'job:create')) throw AppError.forbidden();
    if (queue.status === 'archived') throw AppError.conflict('Cannot submit jobs to an archived queue');

    const input = CreateJobSchema.parse(req.body);
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const job = await jobsService.create(queue.id, input, req.user!.sub, idempotencyKey);
    res.status(201).json({ data: toDto(job), meta: {} });
  },

  async list(req: Request, res: Response) {
    const { queue } = await queuesService.getForUser(req.params.id, req.user!.sub);
    const query = JobQuerySchema.parse(req.query);
    const { items, nextCursor } = await jobsService.list(
      queue.id,
      { status: query.status, type: query.type },
      query.cursor,
      query.limit
    );
    res.status(200).json({ data: items.map(toDto), meta: { nextCursor } });
  },

  async get(req: Request, res: Response) {
    const { job } = await jobsService.getForUser(req.params.id, req.user!.sub);
    res.status(200).json({ data: toDto(job), meta: {} });
  },

  async events(req: Request, res: Response) {
    await jobsService.getForUser(req.params.id, req.user!.sub); // tenant + existence check
    const events = await jobsService.events(req.params.id);
    res.status(200).json({
      data: events.map((e: { id: bigint; eventType: string; attemptNumber: number; metadata: unknown; occurredAt: Date; workerId: string | null }) => ({
        id: e.id.toString(),
        eventType: e.eventType,
        attemptNumber: e.attemptNumber,
        metadata: e.metadata,
        occurredAt: e.occurredAt,
        workerId: e.workerId,
      })),
      meta: {},
    });
  },

  async cancel(req: Request, res: Response) {
    await jobsService.cancel(req.params.id, req.user!.sub);
    res.status(204).send();
  },

  async replay(req: Request, res: Response) {
    const replayed = await jobsService.replay(req.params.id, req.user!.sub);
    res.status(201).json({ data: toDto(replayed), meta: {} });
  },
};
