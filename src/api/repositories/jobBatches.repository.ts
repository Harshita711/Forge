import { prisma } from '../../lib/prisma';

export const jobBatchesRepository = {
  create(data: { queueId: string; name?: string; totalJobs: number; callbackUrl?: string }) {
    return prisma.jobBatch.create({ data });
  },

  findById(id: string) {
    return prisma.jobBatch.findUnique({ where: { id } });
  },

  async incrementProgress(batchId: string, outcome: 'completed' | 'failed') {
    const field = outcome === 'completed' ? 'completedJobs' : 'failedJobs';
    const batch = await prisma.jobBatch.update({
      where: { id: batchId },
      data: { [field]: { increment: 1 } },
    });
    const finished = batch.completedJobs + batch.failedJobs;
    if (finished >= batch.totalJobs && batch.status !== 'completed' && batch.status !== 'completed_with_errors') {
      await prisma.jobBatch.update({
        where: { id: batchId },
        data: {
          status: batch.failedJobs > 0 ? 'completed_with_errors' : 'completed',
          completedAt: new Date(),
        },
      });
    } else if (batch.status === 'pending') {
      await prisma.jobBatch.update({ where: { id: batchId }, data: { status: 'running' } });
    }
    return batch;
  },
};
