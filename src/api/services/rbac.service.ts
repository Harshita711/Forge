import { AppError } from '../../domain/errors';
import { rbacRepository } from '../repositories/rbac.repository';
import { Permission } from '../../domain/permissions';
import { ALL_PERMISSION_KEYS, PERMISSION_CATALOG } from '../../domain/permissionCatalog';

export const rbacService = {
  async listPermissionCatalog() {
    await rbacRepository.ensurePermissionCatalogSeeded(PERMISSION_CATALOG);
    return rbacRepository.listPermissionCatalog();
  },

  async createRole(organizationId: string, name: string, permissionKeys: Permission[]) {
    const invalid = permissionKeys.filter((k) => !ALL_PERMISSION_KEYS.includes(k));
    if (invalid.length > 0) {
      throw AppError.validation('Unknown permission key(s)', invalid.map((k) => ({ key: k })));
    }
    await rbacRepository.ensurePermissionCatalogSeeded(PERMISSION_CATALOG);
    const role = await rbacRepository.createRole(organizationId, name);
    await rbacRepository.setRolePermissions(role.id, permissionKeys);
    return role;
  },

  async list(organizationId: string) {
    const roles = await rbacRepository.listRolesForOrg(organizationId);
    return roles.map((r: { id: string; name: string; isSystem: boolean; permissions: { permission: { key: string } }[] }) => ({
      id: r.id,
      name: r.name,
      isSystem: r.isSystem,
      permissions: r.permissions.map((rp) => rp.permission.key),
    }));
  },

  async getInOrg(organizationId: string, roleId: string) {
    const role = await rbacRepository.findRoleInOrg(organizationId, roleId);
    if (!role) throw AppError.notFound();
    return {
      id: role.id,
      name: role.name,
      isSystem: role.isSystem,
      permissions: role.permissions.map((rp: { permission: { key: string } }) => rp.permission.key),
    };
  },
};
