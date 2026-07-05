import { Request, Response } from 'express';
import { CreateBatchSchema } from '../../domain/schemas';
import { jobBatchesService } from '../services/jobBatches.service';
import { queuesService } from '../services/queues.service';
import { hasEffectivePermission } from '../services/rbacResolution';
import { AppError } from '../../domain/errors';

function toDto(b: {
  id: string;
  name: string | null;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  status: string;
  callbackUrl: string | null;
  createdAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: b.id,
    name: b.name,
    totalJobs: b.totalJobs,
    completedJobs: b.completedJobs,
    failedJobs: b.failedJobs,
    status: b.status,
    callbackUrl: b.callbackUrl,
    createdAt: b.createdAt,
    completedAt: b.completedAt,
  };
}

export const jobBatchesController = {
  async create(req: Request, res: Response) {
    const { queue, membership } = await queuesService.getForUser(req.params.id, req.user!.sub);
    if (!await hasEffectivePermission(membership, 'job:create')) throw AppError.forbidden();
    const input = CreateBatchSchema.parse(req.body);
    const batch = await jobBatchesService.create(queue.id, input);
    res.status(201).json({ data: toDto(batch), meta: {} });
  },

  async get(req: Request, res: Response) {
    const batch = await jobBatchesService.getForUser(req.params.id, req.user!.sub);
    res.status(200).json({ data: toDto(batch), meta: {} });
  },
};
