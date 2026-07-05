import { prisma } from '../../lib/prisma';
import { organizationsRepository } from '../repositories/organizations.repository';

export interface SearchResult {
  kind: 'job' | 'queue' | 'project';
  id: string;
  label: string;
  sublabel: string;
}

export const searchService = {
  async search(query: string, userId: string): Promise<SearchResult[]> {
    if (query.length < 2) return [];
    const orgs = await organizationsRepository.listForUser(userId);
    const orgIds = orgs.map((o: { id: string }) => o.id);
    if (orgIds.length === 0) return [];

    const [projects, queues, jobsByType, jobById] = await Promise.all([
      prisma.project.findMany({
        where: { organizationId: { in: orgIds }, name: { contains: query, mode: 'insensitive' } },
        take: 10,
      }),
      prisma.queue.findMany({
        where: { project: { organizationId: { in: orgIds } }, name: { contains: query, mode: 'insensitive' } },
        include: { project: true },
        take: 10,
      }),
      prisma.job.findMany({
        where: { queue: { project: { organizationId: { in: orgIds } } }, type: { contains: query, mode: 'insensitive' } },
        include: { queue: true },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
      // Exact-ID lookup — UUIDs don't benefit from `contains`, but pasting a
      // job id into search is a real operator workflow worth supporting directly.
      /^[0-9a-f-]{36}$/i.test(query)
        ? prisma.job.findFirst({ where: { id: query, queue: { project: { organizationId: { in: orgIds } } } }, include: { queue: true } })
        : Promise.resolve(null),
    ]);

    const results: SearchResult[] = [];
    for (const p of projects) {
      results.push({ kind: 'project', id: p.id, label: p.name, sublabel: p.slug });
    }
    for (const q of queues) {
      results.push({ kind: 'queue', id: q.id, label: q.name, sublabel: `${q.project.name} / ${q.slug}` });
    }
    for (const j of jobsByType) {
      results.push({ kind: 'job', id: j.id, label: j.type, sublabel: `${j.queue.name} · ${j.status}` });
    }
    if (jobById) {
      results.push({ kind: 'job', id: jobById.id, label: jobById.type, sublabel: `${jobById.queue.name} · ${jobById.status}` });
    }
    return results;
  },
};
