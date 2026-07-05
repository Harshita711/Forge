import { Request, Response } from 'express';
import { PaginationQuerySchema } from '../../domain/schemas';
import { auditLogsRepository } from '../repositories/auditLogs.repository';

export const auditLogsController = {
  async list(req: Request, res: Response) {
    const { page, pageSize } = PaginationQuerySchema.parse(req.query);
    const [items, total] = await auditLogsRepository.listForOrg(req.params.id, page, pageSize);
    res.status(200).json({
      data: items.map((a: { id: bigint; action: string; targetType: string; targetId: string; actorUserId: string | null; metadata: unknown; createdAt: Date }) => ({
        id: a.id.toString(),
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        actorUserId: a.actorUserId,
        metadata: a.metadata,
        createdAt: a.createdAt,
      })),
      meta: { total, page, totalPages: Math.ceil(total / pageSize) },
    });
  },
};
