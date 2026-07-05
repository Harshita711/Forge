import { Request, Response } from 'express';
import { CreateQueueSchema, UpdateQueueSchema } from '../../domain/schemas';
import { queuesService } from '../services/queues.service';
import { projectsService } from '../services/projects.service';
import { hasEffectivePermission } from '../services/rbacResolution';
import { AppError } from '../../domain/errors';

function toDto(q: {
  id: string;
  name: string;
  slug: string;
  status: string;
  priorityWeight: number;
  concurrencyLimit: number;
  visibilityTimeoutSeconds: number;
  partitionCount: number;
  defaultRetryPolicyId: string | null;
  createdAt: Date;
}) {
  return {
    id: q.id,
    name: q.name,
    slug: q.slug,
    status: q.status,
    priorityWeight: q.priorityWeight,
    concurrencyLimit: q.concurrencyLimit,
    visibilityTimeoutSeconds: q.visibilityTimeoutSeconds,
    partitionCount: q.partitionCount,
    defaultRetryPolicyId: q.defaultRetryPolicyId,
    createdAt: q.createdAt,
  };
}

export const queuesController = {
  async create(req: Request, res: Response) {
    const { membership } = await projectsService.getForUser(req.params.id, req.user!.sub);
    if (!await hasEffectivePermission(membership, 'queue:create')) throw AppError.forbidden();
    const input = CreateQueueSchema.parse(req.body);
    const queue = await queuesService.create(req.params.id, input);
    res.status(201).json({ data: toDto(queue), meta: {} });
  },

  async list(req: Request, res: Response) {
    const { membership } = await projectsService.getForUser(req.params.id, req.user!.sub);
    if (!await hasEffectivePermission(membership, 'queue:view')) throw AppError.forbidden();
    const queues = await queuesService.listForProject(req.params.id);
    res.status(200).json({ data: queues.map(toDto), meta: {} });
  },

  async get(req: Request, res: Response) {
    const { queue } = await queuesService.getForUser(req.params.id, req.user!.sub);
    res.status(200).json({ data: toDto(queue), meta: {} });
  },

  async update(req: Request, res: Response) {
    const { membership, queue } = await queuesService.getForUser(req.params.id, req.user!.sub);
    if (!await hasEffectivePermission(membership, 'queue:manage')) throw AppError.forbidden();
    const input = UpdateQueueSchema.parse(req.body);
    const updated = await queuesService.update(queue.id, input);
    res.status(200).json({ data: toDto(updated), meta: {} });
  },

  async pause(req: Request, res: Response) {
    const { membership, queue } = await queuesService.getForUser(req.params.id, req.user!.sub);
    if (!await hasEffectivePermission(membership, 'queue:pause')) throw AppError.forbidden();
    const updated = await queuesService.setStatus(queue.id, 'paused');
    res.status(200).json({ data: toDto(updated), meta: {} });
  },

  async resume(req: Request, res: Response) {
    const { membership, queue } = await queuesService.getForUser(req.params.id, req.user!.sub);
    if (!await hasEffectivePermission(membership, 'queue:pause')) throw AppError.forbidden();
    const updated = await queuesService.setStatus(queue.id, 'active');
    res.status(200).json({ data: toDto(updated), meta: {} });
  },

  async stats(req: Request, res: Response) {
    const { queue } = await queuesService.getForUser(req.params.id, req.user!.sub);
    if (req.query.history) {
      const history = await queuesService.recentStats(queue.id, Number(req.query.history) || 20);
      return res.status(200).json({ data: history, meta: {} });
    }
    const live = await queuesService.liveStats(queue.id);
    res.status(200).json({
      data: {
        queuedCount: live.queuedCount,
        runningCount: live.runningCount,
        completedCount: live.completedCount,
        failedCount: live.failedCount,
        throughputPerMin: live.throughputPerMin,
        avgLatencyMs: live.avgLatencyMs,
        errorRate: live.errorRate,
        recordedAt: live.recordedAt,
      },
      meta: {},
    });
  },

  async delete(req: Request, res: Response) {
    const { membership, queue } = await queuesService.getForUser(req.params.id, req.user!.sub);
    if (!await hasEffectivePermission(membership, 'queue:delete')) throw AppError.forbidden();
    await queuesService.delete(queue.id);
    res.status(204).send();
  },
};
