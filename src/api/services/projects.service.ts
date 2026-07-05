import { AppError } from '../../domain/errors';
import { CreateProjectInput, UpdateProjectInput } from '../../domain/schemas';
import { projectsRepository } from '../repositories/projects.repository';
import { organizationsRepository } from '../repositories/organizations.repository';
import { hasEffectivePermission } from './rbacResolution';

export const projectsService = {
  async create(organizationId: string, input: CreateProjectInput, createdBy: string) {
    const existing = await projectsRepository.findBySlugInOrg(organizationId, input.slug);
    if (existing) {
      // Slugs are unique per-organization, not globally (Section 4.4) — two
      // tenants can both have a project named "backend".
      throw AppError.conflict('A project with this slug already exists in this organization');
    }
    return projectsRepository.create({
      organizationId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      createdBy,
    });
  },

  async getInOrg(organizationId: string, projectId: string) {
    const project = await projectsRepository.findByIdInOrg(organizationId, projectId);
    if (!project) throw AppError.notFound();
    return project;
  },

  // Backs GET/PATCH/DELETE /v1/projects/:id (Table 61), which carry no
  // organization in the path. Resolves the org from the project row itself,
  // then requires the caller to be a member of that org — never 403, always
  // 404 for a project the caller cannot see (Section 14.1).
  async getForUser(projectId: string, userId: string) {
    const project = await projectsRepository.findById(projectId);
    if (!project) throw AppError.notFound();
    const membership = await organizationsRepository.getMembership(project.organizationId, userId);
    if (!membership) throw AppError.notFound();
    return { project, membership };
  },

  async updateForUser(projectId: string, userId: string, input: UpdateProjectInput) {
    const { membership } = await this.getForUser(projectId, userId);
    if (!await hasEffectivePermission(membership, 'project:manage')) {
      throw AppError.forbidden();
    }
    return projectsRepository.update(projectId, input);
  },

  async deleteForUser(projectId: string, userId: string) {
    const { membership } = await this.getForUser(projectId, userId);
    if (!await hasEffectivePermission(membership, 'project:manage')) {
      throw AppError.forbidden();
    }
    const queueCount = await projectsRepository.countQueues(projectId);
    if (queueCount > 0) {
      throw AppError.conflict(
        'Project has existing queues and cannot be deleted — archive its queues first'
      );
    }
    await projectsRepository.delete(projectId);
  },

  async list(organizationId: string, page: number, pageSize: number) {
    const [items, total] = await projectsRepository.listForOrg(organizationId, page, pageSize);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async update(organizationId: string, projectId: string, input: UpdateProjectInput) {
    await this.getInOrg(organizationId, projectId); // 404s if cross-tenant or missing
    return projectsRepository.update(projectId, input);
  },

  async delete(organizationId: string, projectId: string) {
    await this.getInOrg(organizationId, projectId);
    const queueCount = await projectsRepository.countQueues(projectId);
    if (queueCount > 0) {
      throw AppError.conflict(
        'Project has existing queues and cannot be deleted — archive its queues first'
      );
    }
    await projectsRepository.delete(projectId);
  },
};
