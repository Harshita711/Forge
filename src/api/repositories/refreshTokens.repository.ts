import { prisma } from '../../lib/prisma';

export const refreshTokensRepository = {
  create(data: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }) {
    return prisma.refreshToken.create({ data });
  },
  findByTokenHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },
  revokeById(id: string) {
    return prisma.refreshToken.update({ where: { id }, data: { revoked: true } });
  },
  // Reuse detection: an already-rotated token being presented again means it
  // was captured — revoke every token descended from the same login (Section 14.2).
  revokeFamily(familyId: string) {
    return prisma.refreshToken.updateMany({ where: { familyId }, data: { revoked: true } });
  },
  listActiveForUser(userId: string) {
    return prisma.refreshToken.findMany({
      where: { userId, revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  },
};
