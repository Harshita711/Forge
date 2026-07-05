import { AppError } from '../../domain/errors';
import { CreateOrganizationInput, InviteMemberInput, UpdateOrganizationInput } from '../../domain/schemas';
import { organizationsRepository } from '../repositories/organizations.repository';
import { usersRepository } from '../repositories/users.repository';
import { rbacRepository } from '../repositories/rbac.repository';
import { auditLogsRepository } from '../repositories/auditLogs.repository';

export const organizationsService = {
  async create(input: CreateOrganizationInput, ownerUserId: string) {
    return organizationsRepository.createWithOwner(input.name, ownerUserId);
  },

  listForUser(userId: string) {
    return organizationsRepository.listForUser(userId);
  },

  async getForUser(organizationId: string, userId: string) {
    const membership = await organizationsRepository.getMembership(organizationId, userId);
    if (!membership) throw AppError.notFound(); // Section 14.1: never leak existence
    const org = await organizationsRepository.findById(organizationId);
    if (!org) throw AppError.notFound();
    return org;
  },

  async update(organizationId: string, input: UpdateOrganizationInput, actorUserId: string) {
    const org = await organizationsRepository.update(organizationId, input);
    await auditLogsRepository.record({
      organizationId,
      actorUserId,
      action: 'organization.updated',
      targetType: 'organization',
      targetId: organizationId,
      metadata: input,
    });
    return org;
  },

  listMembers(organizationId: string) {
    return organizationsRepository.listMembers(organizationId);
  },

  async invite(organizationId: string, input: InviteMemberInput, actorUserId: string) {
    const user = await usersRepository.findByEmail(input.email);
    if (!user) {
      // Phase 0 assumes the invitee already has a Forge account; an
      // email-invite-for-non-users flow is a natural Phase 4+ dashboard feature.
      throw AppError.notFound('No Forge account exists for this email yet');
    }
    const existing = await organizationsRepository.getMembership(organizationId, user.id);
    if (existing) {
      throw AppError.conflict('User is already a member of this organization');
    }
    const membership = await organizationsRepository.addMember(organizationId, user.id, input.role);
    await auditLogsRepository.record({
      organizationId,
      actorUserId,
      action: 'member.invited',
      targetType: 'user',
      targetId: user.id,
      metadata: { role: input.role },
    });
    return membership;
  },

  async changeMemberRole(
    organizationId: string,
    targetUserId: string,
    role: string,
    actorUserId: string,
    customRoleId?: string | null
  ) {
    const membership = await organizationsRepository.getMembership(organizationId, targetUserId);
    if (!membership) throw AppError.notFound();
    if (customRoleId) {
      const role_ = await rbacRepository.findRoleInOrg(organizationId, customRoleId);
      if (!role_) throw AppError.validation('customRoleId does not reference a role in this organization');
    }
    const updated = await organizationsRepository.updateMemberRole(organizationId, targetUserId, role, customRoleId);
    await auditLogsRepository.record({
      organizationId,
      actorUserId,
      action: 'member.role_changed',
      targetType: 'user',
      targetId: targetUserId,
      metadata: { role, customRoleId },
    });
    return updated;
  },

  async removeMember(organizationId: string, targetUserId: string, actorUserId: string) {
    const membership = await organizationsRepository.getMembership(organizationId, targetUserId);
    if (!membership) throw AppError.notFound();
    await organizationsRepository.removeMember(organizationId, targetUserId);
    await auditLogsRepository.record({
      organizationId,
      actorUserId,
      action: 'member.removed',
      targetType: 'user',
      targetId: targetUserId,
    });
  },
};
