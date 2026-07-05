import { prisma } from '../../lib/prisma';

export const notificationsRepository = {
  create(data: { userId: string; organizationId: string; type: string; title: string; body: string; link?: string }) {
    return prisma.notification.create({ data });
  },

  listForUser(userId: string, unreadOnly: boolean) {
    return prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  markRead(id: string, userId: string) {
    // Scoped by userId in the WHERE clause, not just the primary key — a
    // notification belongs to exactly one recipient, so this doubles as the
    // ownership check (Section 14.1 pattern) without a separate lookup.
    return prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
  },
};
