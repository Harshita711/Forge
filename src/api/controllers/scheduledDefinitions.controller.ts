import { Request, Response } from 'express';
import {
  CreateScheduledDefinitionSchema,
  CronPreviewQuerySchema,
  UpdateScheduledDefinitionSchema,
} from '../../domain/schemas';
import { scheduledDefinitionsService } from '../services/scheduledDefinitions.service';
import { queuesService } from '../services/queues.service';
import { cronPreview } from '../../domain/cron';
import { hasEffectivePermission } from '../services/rbacResolution';
import { AppError } from '../../domain/errors';

function toDto(d: {
  id: string;
  jobType: string;
  payloadTemplate: unknown;
  scheduleType: string;
  cronExpression: string | null;
  timezone: string;
  runAt: Date | null;
  nextRunAt: Date;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: d.id,
    jobType: d.jobType,
    payloadTemplate: d.payloadTemplate,
    scheduleType: d.scheduleType,
    cronExpression: d.cronExpression,
    timezone: d.timezone,
    runAt: d.runAt,
    nextRunAt: d.nextRunAt,
    isActive: d.isActive,
    createdAt: d.createdAt,
  };
}

export const scheduledDefinitionsController = {
  async create(req: Request, res: Response) {
    const { queue, membership } = await queuesService.getForUser(req.params.id, req.user!.sub);
    if (!await hasEffectivePermission(membership, 'queue:manage')) throw AppError.forbidden();
    const input = CreateScheduledDefinitionSchema.parse(req.body);
    const def = await scheduledDefinitionsService.create(queue.id, input, req.user!.sub);
    res.status(201).json({ data: toDto(def), meta: {} });
  },

  async list(req: Request, res: Response) {
    const { queue } = await queuesService.getForUser(req.params.id, req.user!.sub);
    const defs = await scheduledDefinitionsService.list(queue.id);
    res.status(200).json({ data: defs.map(toDto), meta: {} });
  },

  async get(req: Request, res: Response) {
    const { def } = await scheduledDefinitionsService.getForUser(req.params.id, req.user!.sub);
    res.status(200).json({ data: toDto(def), meta: {} });
  },

  async update(req: Request, res: Response) {
    const { membership } = await scheduledDefinitionsService.getForUser(req.params.id, req.user!.sub);
    if (!await hasEffectivePermission(membership, 'queue:manage')) throw AppError.forbidden();
    const input = UpdateScheduledDefinitionSchema.parse(req.body);
    const updated = await scheduledDefinitionsService.update(req.params.id, input);
    res.status(200).json({ data: toDto(updated), meta: {} });
  },

  async delete(req: Request, res: Response) {
    const { membership } = await scheduledDefinitionsService.getForUser(req.params.id, req.user!.sub);
    if (!await hasEffectivePermission(membership, 'queue:manage')) throw AppError.forbidden();
    await scheduledDefinitionsService.delete(req.params.id);
    res.status(204).send();
  },

  // Section 7.4 / 11.15 — pure computation, no DB write.
  async preview(req: Request, res: Response) {
    const query = CronPreviewQuerySchema.parse(req.query);
    const occurrences = cronPreview(query.cronExpression, query.timezone, query.count);
    res.status(200).json({ data: { occurrences }, meta: {} });
  },
};
