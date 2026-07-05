import { prisma } from '../../lib/prisma';

export const usersRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },
  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },
  create(data: { email: string; passwordHash: string; fullName: string }) {
    return prisma.user.create({ data });
  },
  touchLastLogin(id: string) {
    return prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  },
};
