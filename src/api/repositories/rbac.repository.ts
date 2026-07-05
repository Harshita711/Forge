import { prisma } from '../../lib/prisma';

export const rbacRepository = {
  listPermissionCatalog() {
    return prisma.permission.findMany({ orderBy: { key: 'asc' } });
  },

  async ensurePermissionCatalogSeeded(catalog: { key: string; description: string }[]) {
    for (const p of catalog) {
      await prisma.permission.upsert({
        where: { key: p.key },
        create: p,
        update: { description: p.description },
      });
    }
  },

  createRole(organizationId: string, name: string) {
    return prisma.role.create({ data: { organizationId, name } });
  },

  listRolesForOrg(organizationId: string) {
    return prisma.role.findMany({
      where: { organizationId },
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  },

  findRoleInOrg(organizationId: string, roleId: string) {
    return prisma.role.findFirst({
      where: { id: roleId, organizationId },
      include: { permissions: { include: { permission: true } } },
    });
  },

  async setRolePermissions(roleId: string, permissionKeys: string[]) {
    const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p: { id: string }) => ({ roleId, permissionId: p.id })),
    });
  },

  permissionKeysForRole(roleId: string) {
    return prisma.rolePermission
      .findMany({ where: { roleId }, include: { permission: true } })
      .then((rows: { permission: { key: string } }[]) => rows.map((r) => r.permission.key));
  },
};
