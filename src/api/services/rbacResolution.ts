import { CoarseRole, Permission, hasPermission as hasCoarsePermission } from '../../domain/permissions';
import { rbacRepository } from '../repositories/rbac.repository';

export interface MembershipLike {
  role: string;
  customRoleId: string | null;
}

// Section 11.6: "a custom role, when assigned, entirely replaces the coarse
// role for permission checks — it does not layer on top of or restrict the
// coarse role, since a custom role's whole purpose is letting an
// organization define a permission set the four built-ins don't express."
export async function hasEffectivePermission(membership: MembershipLike, permission: Permission): Promise<boolean> {
  if (membership.customRoleId) {
    const keys = await rbacRepository.permissionKeysForRole(membership.customRoleId);
    return keys.includes(permission);
  }
  return hasCoarsePermission(membership.role as CoarseRole, permission);
}
