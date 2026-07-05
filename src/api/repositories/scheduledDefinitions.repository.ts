import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const scheduledDefinitionsRepository = {
  create(data: {
    queueId: string;
    jobType: string;
    payloadTemplate: Record<string, unknown>;
    scheduleType: 'cron' | 'delayed';
    cronExpression?: string;
    timezone: string;
    runAt?: Date;
    nextRunAt: Date;
    createdBy: string;
  }) {
    return prisma.scheduledDefinition.create({
      data: { ...data, payloadTemplate: data.payloadTemplate as Prisma.InputJsonValue },
    });
  },

  findById(id: string) {
    return prisma.scheduledDefinition.findUnique({ where: { id }, include: { queue: { include: { project: true } } } });
  },

  listForQueue(queueId: string) {
    return prisma.scheduledDefinition.findMany({ where: { queueId }, orderBy: { createdAt: 'desc' } });
  },

  update(id: string, data: Partial<{ cronExpression: string; timezone: string; isActive: boolean; nextRunAt: Date }>) {
    return prisma.scheduledDefinition.update({ where: { id }, data });
  },

  delete(id: string) {
    return prisma.scheduledDefinition.update({ where: { id }, data: { isActive: false } });
  },
};
