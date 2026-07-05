import { Request, Response } from 'express';
import {
  ChangeMemberRoleSchema,
  CreateOrganizationSchema,
  InviteMemberSchema,
  UpdateOrganizationSchema,
} from '../../domain/schemas';
import { organizationsService } from '../services/organizations.service';

export const organizationsController = {
  async create(req: Request, res: Response) {
    const input = CreateOrganizationSchema.parse(req.body);
    const org = await organizationsService.create(input, req.user!.sub);
    res.status(201).json({ data: { id: org.id, name: org.name, slug: org.slug }, meta: {} });
  },

  async list(req: Request, res: Response) {
    const orgs = await organizationsService.listForUser(req.user!.sub);
    res.status(200).json({
      data: orgs.map((o: { id: string; name: string; slug: string }) => ({ id: o.id, name: o.name, slug: o.slug })),
      meta: {},
    });
  },

  async get(req: Request, res: Response) {
    const org = await organizationsService.getForUser(req.params.id, req.user!.sub);
    res.status(200).json({ data: { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt }, meta: {} });
  },

  async update(req: Request, res: Response) {
    const input = UpdateOrganizationSchema.parse(req.body);
    const org = await organizationsService.update(req.params.id, input, req.user!.sub);
    res.status(200).json({ data: { id: org.id, name: org.name, slug: org.slug }, meta: {} });
  },

  async listMembers(req: Request, res: Response) {
    const members = await organizationsService.listMembers(req.params.id);
    res.status(200).json({
      data: members.map(
        (m: { userId: string; role: string; joinedAt: Date | null; user: { email: string; fullName: string } }) => ({
          userId: m.userId,
          email: m.user.email,
          fullName: m.user.fullName,
          role: m.role,
          joinedAt: m.joinedAt,
        })
      ),
      meta: {},
    });
  },

  async invite(req: Request, res: Response) {
    const input = InviteMemberSchema.parse(req.body);
    const membership = await organizationsService.invite(req.params.id, input, req.user!.sub);
    res.status(201).json({ data: { userId: membership.userId, role: membership.role }, meta: {} });
  },

  async changeMemberRole(req: Request, res: Response) {
    const input = ChangeMemberRoleSchema.parse(req.body);
    const membership = await organizationsService.changeMemberRole(
      req.params.id,
      req.params.userId,
      input.role ?? 'member',
      req.user!.sub,
      input.customRoleId
    );
    res.status(200).json({ data: { userId: membership.userId, role: membership.role, customRoleId: membership.customRoleId }, meta: {} });
  },

  async removeMember(req: Request, res: Response) {
    await organizationsService.removeMember(req.params.id, req.params.userId, req.user!.sub);
    res.status(204).send();
  },
};
