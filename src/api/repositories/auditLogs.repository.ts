import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const auditLogsRepository = {
  record(data: {
    organizationId: string;
    actorUserId?: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }) {
    return prisma.auditLog.create({
      data: {
        ...data,
        metadata: data.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  },

  listForOrg(organizationId: string, page: number, pageSize: number) {
    return Promise.all([
      prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where: { organizationId } }),
    ]);
  },
};
