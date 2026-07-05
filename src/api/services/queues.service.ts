import { AppError } from '../../domain/errors';
import { CreateQueueInput, UpdateQueueInput } from '../../domain/schemas';
import { queuesRepository } from '../repositories/queues.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { organizationsRepository } from '../repositories/organizations.repository';

export const queuesService = {
  async create(projectId: string, input: CreateQueueInput) {
    const existing = await queuesRepository.findBySlugInProject(projectId, input.slug);
    if (existing) {
      throw AppError.conflict('A queue with this slug already exists in this project');
    }
    return queuesRepository.create({
      projectId,
      name: input.name,
      slug: input.slug,
      priorityWeight: input.priorityWeight,
      concurrencyLimit: input.concurrencyLimit,
      visibilityTimeoutSeconds: input.visibilityTimeoutSeconds,
      partitionCount: input.partitionCount,
      defaultRetryPolicyId: input.defaultRetryPolicyId,
    });
  },

  listForProject(projectId: string) {
    return queuesRepository.listForProject(projectId);
  },

  // Backs GET/PATCH/POST-pause/POST-resume/DELETE /v1/queues/:id (Table 62,
  // no org/project in the path) — resolves tenant from queue -> project ->
  // organization, same never-403-always-404 pattern as projects (Section 14.1).
  async getForUser(queueId: string, userId: string) {
    const queue = await queuesRepository.findById(queueId);
    if (!queue) throw AppError.notFound();
    const membership = await organizationsRepository.getMembership(queue.project.organizationId, userId);
    if (!membership) throw AppError.notFound();
    return { queue, membership, organizationId: queue.project.organizationId };
  },

  async update(queueId: string, input: UpdateQueueInput) {
    return queuesRepository.update(queueId, input);
  },

  async setStatus(queueId: string, status: 'active' | 'paused') {
    // Pausing/resuming never rewrites existing job rows (Section 11.21) — the
    // claim query's own "AND queue.status = 'active'" clause is what makes a
    // pause take effect, so this is a single O(1) UPDATE on the queue itself.
    return queuesRepository.setStatus(queueId, status);
  },

  async delete(queueId: string) {
    const activeJobCount = await queuesRepository.countJobs(queueId);
    if (activeJobCount > 0) {
      throw AppError.conflict('Queue has active jobs and cannot be archived until they finish or are cancelled');
    }
    // Table 62 calls this "Archive" rather than a hard delete — job history
    // (jobs.queue_id) references this row with ON DELETE RESTRICT anyway
    // (Section 4.8), so archiving is both what the spec asks for and the only
    // thing the schema would actually permit once any job has ever existed.
    await queuesRepository.setStatus(queueId, 'archived');
  },

  latestStats(queueId: string) {
    return queuesRepository.latestMetricsSnapshot(queueId);
  },

  liveStats(queueId: string) {
    return queuesRepository.liveStatsForQueue(queueId);
  },

  async recentStats(queueId: string, limit = 20) {
    const snapshots = await queuesRepository.recentMetricsSnapshots(queueId, limit);
    return snapshots.reverse(); // oldest first, so a sparkline reads left-to-right chronologically
  },

  // Used at job-creation time to confirm the queue belongs to the project the
  // route implies, even though this delivery nests creation under /v1/projects/:id/queues.
  async assertBelongsToProject(queueId: string, projectId: string) {
    const project = await projectsRepository.findById(projectId);
    if (!project) throw AppError.notFound();
    return project;
  },
};
