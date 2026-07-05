export type CoarseRole = 'owner' | 'admin' | 'member' | 'viewer';

export type Permission =
  | 'org:view'
  | 'org:manage'
  | 'org:manage_billing'
  | 'org:delete'
  | 'member:invite'
  | 'member:change_role'
  | 'project:create'
  | 'project:view'
  | 'project:manage'
  | 'queue:create'
  | 'queue:view'
  | 'queue:manage'
  | 'queue:pause'
  | 'queue:delete'
  | 'job:create'
  | 'job:view'
  | 'job:cancel'
  | 'job:replay'
  | 'dlq:view'
  | 'dlq:retry'
  | 'dlq:edit'
  | 'worker:view';

// Table 49 — Permission x Coarse Role matrix. Custom roles (Section 11.6,
// organization_members.custom_role_id) override this default and are implemented
// in Phase 5; Phase 0 only needs this coarse layer for org/project CRUD.
const COARSE_ROLE_PERMISSIONS: Record<CoarseRole, Permission[]> = {
  owner: [
    'org:view', 'org:manage', 'org:manage_billing', 'org:delete',
    'member:invite', 'member:change_role',
    'project:create', 'project:view', 'project:manage',
    'queue:create', 'queue:view', 'queue:manage', 'queue:pause', 'queue:delete',
    'job:create', 'job:view', 'job:cancel', 'job:replay',
    'dlq:view', 'dlq:retry', 'dlq:edit',
    'worker:view',
  ],
  admin: [
    'org:view',
    'member:invite', 'member:change_role',
    'project:create', 'project:view', 'project:manage',
    'queue:create', 'queue:view', 'queue:manage', 'queue:pause', 'queue:delete',
    'job:create', 'job:view', 'job:cancel', 'job:replay',
    'dlq:view', 'dlq:retry', 'dlq:edit',
    'worker:view',
  ],
  member: [
    'org:view',
    'project:view',
    'queue:view',
    'job:create', 'job:view', 'job:cancel', 'job:replay',
    'dlq:view', 'dlq:retry',
    'worker:view',
  ],
  viewer: [
    'org:view', 'project:view', 'queue:view', 'job:view', 'dlq:view', 'worker:view',
  ],
};

export function effectivePermissions(role: CoarseRole): Permission[] {
  return COARSE_ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(role: CoarseRole, permission: Permission): boolean {
  return effectivePermissions(role).includes(permission);
}
