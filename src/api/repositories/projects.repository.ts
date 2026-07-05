import { prisma } from '../../lib/prisma';

export const projectsRepository = {
  create(data: { organizationId: string; name: string; slug: string; description?: string; createdBy: string }) {
    return prisma.project.create({ data });
  },

  // Cross-tenant safety (Section 14.1): organizationId is always an explicit
  // parameter in the WHERE clause, never trusted from the path alone.
  findByIdInOrg(organizationId: string, id: string) {
    return prisma.project.findFirst({ where: { id, organizationId } });
  },

  // Used only by the /v1/projects/:id routes (Table 61), which carry no org in
  // the path. The service layer immediately re-checks the caller's membership
  // in the returned project's organizationId before returning any data.
  findById(id: string) {
    return prisma.project.findUnique({ where: { id } });
  },

  findBySlugInOrg(organizationId: string, slug: string) {
    return prisma.project.findFirst({ where: { slug, organizationId } });
  },

  listForOrg(organizationId: string, page: number, pageSize: number) {
    return Promise.all([
      prisma.project.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.project.count({ where: { organizationId } }),
    ]);
  },

  update(id: string, data: { name?: string; description?: string | null }) {
    return prisma.project.update({ where: { id }, data });
  },

  async delete(id: string) {
    // Section 4.4 has no explicit cascade rule for projects→queues beyond the
    // queues table's own RESTRICT-while-jobs-exist rule (Section 4.20); a
    // project with queues fails this delete with a foreign-key violation,
    // which the service layer surfaces as 409 CONFLICT rather than 500.
    return prisma.project.delete({ where: { id } });
  },

  countQueues(projectId: string) {
    return prisma.queue.count({ where: { projectId } });
  },
};
