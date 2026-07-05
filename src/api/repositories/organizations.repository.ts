import { prisma } from '../../lib/prisma';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const organizationsRepository = {
  slugify,

  async createWithOwner(name: string, ownerUserId: string) {
    const baseSlug = slugify(name) || 'org';
    let slug = baseSlug;
    let attempt = 0;
    // Slugs are globally unique (Section 4.2) — retry with a numeric suffix on collision.
    while (await prisma.organization.findUnique({ where: { slug } })) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    return prisma.organization.create({
      data: {
        name,
        slug,
        createdBy: ownerUserId,
        members: {
          create: { userId: ownerUserId, role: 'owner', joinedAt: new Date() },
        },
      },
      include: { members: true },
    });
  },

  findById(id: string) {
    return prisma.organization.findUnique({ where: { id } });
  },

  findBySlug(slug: string) {
    return prisma.organization.findUnique({ where: { slug } });
  },

  listForUser(userId: string) {
    return prisma.organization.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  update(id: string, data: { name?: string }) {
    return prisma.organization.update({ where: { id }, data });
  },

  getMembership(organizationId: string, userId: string) {
    return prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
  },

  listMembers(organizationId: string) {
    return prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, fullName: true } } },
      orderBy: { joinedAt: 'asc' },
    });
  },

  addMember(organizationId: string, userId: string, role: string) {
    return prisma.organizationMember.create({
      data: { organizationId, userId, role, joinedAt: new Date() },
    });
  },

  updateMemberRole(organizationId: string, userId: string, role: string, customRoleId?: string | null) {
    return prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { role, ...(customRoleId !== undefined ? { customRoleId } : {}) },
    });
  },

  removeMember(organizationId: string, userId: string) {
    return prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId, userId } },
    });
  },
};
