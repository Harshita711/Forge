import { prisma } from '../../lib/prisma';

export const retryPoliciesRepository = {
  create(data: {
    organizationId: string;
    name: string;
    strategy: string;
    baseDelaySeconds: number;
    maxDelaySeconds: number;
    maxAttempts: number;
    jitter: boolean;
  }) {
    return prisma.retryPolicy.create({ data });
  },

  findByIdInOrg(organizationId: string, id: string) {
    return prisma.retryPolicy.findFirst({ where: { id, organizationId } });
  },

  listForOrg(organizationId: string) {
    return prisma.retryPolicy.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
  },
};
