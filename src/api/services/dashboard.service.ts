import { AppError } from '../../domain/errors';
import { dashboardRepository } from '../repositories/dashboard.repository';
import { queuesRepository } from '../repositories/queues.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { organizationsRepository } from '../repositories/organizations.repository';
import { hasEffectivePermission } from './rbacResolution';

export const dashboardService = {
  // Resolves + authorizes the same way every other project-scoped read does
  // (Section 14.1): look the project up, then require membership in its
  // organization. Dashboard visibility piggybacks on queue:view since a
  // dashboard is just an aggregate view over queues/jobs the caller could
  // already see individually.
  async getForUser(projectId: string, userId: string) {
    const project = await projectsRepository.findById(projectId);
    if (!project) throw AppError.notFound();
    const membership = await organizationsRepository.getMembership(project.organizationId, userId);
    if (!membership) throw AppError.notFound();
    if (!(await hasEffectivePermission(membership, 'queue:view'))) throw AppError.forbidden();

    const [statusCounts, throughput, processingTime, retryStats, dlqCount, queueCount, cluster, queues, countsByQueue] =
      await Promise.all([
        dashboardRepository.statusCountsForProject(projectId),
        dashboardRepository.throughputSeries(projectId, 30),
        dashboardRepository.processingTime(projectId, 60),
        dashboardRepository.retryStats(projectId),
        dashboardRepository.dlqCountForProject(projectId),
        dashboardRepository.queueCountForProject(projectId),
        dashboardRepository.clusterUtilization(),
        queuesRepository.listForProject(projectId),
        dashboardRepository.statusCountsByQueue(projectId),
      ]);

    const queueBreakdown = queues
      .filter((q) => q.status !== 'archived')
      .map((q) => ({
        id: q.id,
        name: q.name,
        slug: q.slug,
        status: q.status,
        concurrencyLimit: q.concurrencyLimit,
        counts: countsByQueue[q.id] ?? {
          queued: 0,
          running: 0,
          completed: 0,
          failed: 0,
          retrying: 0,
          pending: 0,
          scheduled: 0,
          cancelled: 0,
          total: 0,
        },
      }));

    return {
      project: { id: project.id, name: project.name, slug: project.slug },
      statusCounts,
      throughput,
      processingTime,
      retryStats,
      dlqCount,
      queueCount,
      cluster,
      queueBreakdown,
      generatedAt: new Date().toISOString(),
    };
  },
};