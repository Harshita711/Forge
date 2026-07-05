import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { notificationsRepository } from './notifications.repository';

export const dlqRepository = {
  async create(data: {
    originalJobId: string;
    queueId: string;
    type: string;
    payload: Record<string, unknown>;
    failureReason: string;
    attemptCount: number;
  }) {
    const entry = await prisma.deadLetterQueueEntry.create({
      data: {
        ...data,
        payload: data.payload as Prisma.InputJsonValue,
      },
    });

    // Notify org owners/admins — a dead-lettered job is exactly the kind of
    // thing that otherwise sits silently until someone happens to open the
    // dashboard's DLQ inbox.
    try {
      const queue = await prisma.queue.findUnique({ where: { id: data.queueId }, include: { project: true } });
      if (queue) {
        const admins = await prisma.organizationMember.findMany({
          where: { organizationId: queue.project.organizationId, role: { in: ['owner', 'admin'] } },
        });
        await Promise.all(
          admins.map((m: { userId: string }) =>
            notificationsRepository.create({
              userId: m.userId,
              organizationId: queue.project.organizationId,
              type: 'dlq_entry',
              title: `Job dead-lettered in ${queue.name}`,
              body: `A '${data.type}' job failed permanently after ${data.attemptCount} attempt(s): ${data.failureReason.slice(0, 200)}`,
              link: `/dlq/${entry.id}`,
            })
          )
        );
      }
    } catch {
      // Notification fan-out is best-effort UX, never a reason to fail the
      // DLQ write itself (Section 1.2's partition-tolerance stance again).
    }

    return entry;
  },

  listUnresolvedForQueue(queueId: string) {
    return prisma.deadLetterQueueEntry.findMany({
      where: { queueId, resolved: false },
      orderBy: { createdAt: 'desc' },
    });
  },

  findByIdWithSummaries(id: string) {
    return prisma.deadLetterQueueEntry.findUnique({
      where: { id },
      include: { aiSummaries: { orderBy: { generatedAt: 'desc' } }, originalJob: true },
    });
  },

  resolve(id: string, resolvedBy: string, action: 'retried' | 'dismissed', retriedAsJobId?: string) {
    return prisma.deadLetterQueueEntry.update({
      where: { id },
      data: { resolved: true, resolvedBy, resolvedAction: action, retriedAsJobId, resolvedAt: new Date() },
    });
  },
};
