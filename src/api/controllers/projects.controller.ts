import { Request, Response } from 'express';
import { CreateProjectSchema, PaginationQuerySchema, UpdateProjectSchema } from '../../domain/schemas';
import { projectsService } from '../services/projects.service';

function toDto(p: { id: string; name: string; slug: string; description: string | null; createdAt: Date }) {
  return { id: p.id, name: p.name, slug: p.slug, description: p.description, createdAt: p.createdAt };
}

export const projectsController = {
  async create(req: Request, res: Response) {
    const input = CreateProjectSchema.parse(req.body);
    const project = await projectsService.create(req.params.id, input, req.user!.sub);
    res.status(201).json({ data: toDto(project), meta: {} });
  },

  async list(req: Request, res: Response) {
    const { page, pageSize } = PaginationQuerySchema.parse(req.query);
    const result = await projectsService.list(req.params.id, page, pageSize);
    res.status(200).json({
      data: result.items.map(toDto),
      meta: { total: result.total, page: result.page, totalPages: result.totalPages },
    });
  },

  async get(req: Request, res: Response) {
    const { project } = await projectsService.getForUser(req.params.id, req.user!.sub);
    res.status(200).json({ data: toDto(project), meta: {} });
  },

  async update(req: Request, res: Response) {
    const input = UpdateProjectSchema.parse(req.body);
    const project = await projectsService.updateForUser(req.params.id, req.user!.sub, input);
    res.status(200).json({ data: toDto(project), meta: {} });
  },

  async delete(req: Request, res: Response) {
    await projectsService.deleteForUser(req.params.id, req.user!.sub);
    res.status(204).send();
  },
};
