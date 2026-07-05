import { describe, expect, it } from 'vitest';
import { effectivePermissions, hasPermission } from '../src/domain/permissions';

describe('coarse role permission resolution (Table 49)', () => {
  it('owner has every listed permission, including billing and delete', () => {
    expect(hasPermission('owner', 'org:manage_billing')).toBe(true);
    expect(hasPermission('owner', 'org:delete')).toBe(true);
    expect(hasPermission('owner', 'dlq:edit')).toBe(true);
  });

  it('admin can manage queues/members but not billing or org deletion', () => {
    expect(hasPermission('admin', 'queue:manage')).toBe(true);
    expect(hasPermission('admin', 'member:invite')).toBe(true);
    expect(hasPermission('admin', 'org:manage_billing')).toBe(false);
    expect(hasPermission('admin', 'org:delete')).toBe(false);
  });

  it('member can create/cancel/replay jobs and retry DLQ but cannot manage queues', () => {
    expect(hasPermission('member', 'job:create')).toBe(true);
    expect(hasPermission('member', 'job:replay')).toBe(true);
    expect(hasPermission('member', 'dlq:retry')).toBe(true);
    expect(hasPermission('member', 'queue:manage')).toBe(false);
    expect(hasPermission('member', 'dlq:edit')).toBe(false);
  });

  it('viewer only has *:view permissions', () => {
    const perms = effectivePermissions('viewer');
    expect(perms.every((p) => p.endsWith(':view'))).toBe(true);
    expect(hasPermission('viewer', 'job:create')).toBe(false);
  });
});
