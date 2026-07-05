import { Request, Response } from 'express';
import { CreateRoleSchema } from '../../domain/schemas';
import { rbacService } from '../services/rbac.service';
import { Permission } from '../../domain/permissions';

export const rbacController = {
  async listPermissionCatalog(_req: Request, res: Response) {
    const permissions = await rbacService.listPermissionCatalog();
    res.status(200).json({ data: permissions, meta: {} });
  },

  async createRole(req: Request, res: Response) {
    const input = CreateRoleSchema.parse(req.body);
    const role = await rbacService.createRole(req.params.id, input.name, input.permissionKeys as Permission[]);
    res.status(201).json({ data: { id: role.id, name: role.name }, meta: {} });
  },

  async list(req: Request, res: Response) {
    const roles = await rbacService.list(req.params.id);
    res.status(200).json({ data: roles, meta: {} });
  },

  async get(req: Request, res: Response) {
    const role = await rbacService.getInOrg(req.params.id, req.params.roleId);
    res.status(200).json({ data: role, meta: {} });
  },
};
