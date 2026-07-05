import { AppError } from '../../domain/errors';
import { CreateBatchInput } from '../../domain/schemas';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { jobBatchesRepository } from '../repositories/jobBatches.repository';
import { organizationsRepository } from '../repositories/organizations.repository';
import { partitionKeyForJobId } from '../../domain/partitioning';
import { randomUUID } from 'crypto';

const DEFAULT_MAX_ATTEMPTS = 5;

export const jobBatchesService = {
  async create(queueId: string, input: CreateBatchInput) {
    const queue = await prisma.queue.findUnique({ where: { id: queueId }, select: { partitionCount: true } });
    const partitionCount = queue?.partitionCount ?? 1;

    return prisma.$transaction(async (tx) => {
      const batch = await tx.jobBatch.create({
        data: { queueId, name: input.name, totalJobs: input.jobs.length, callbackUrl: input.callbackUrl },
      });
      for (const jobInput of input.jobs) {
        const id = randomUUID();
        const partitionKey = partitionKeyForJobId(id, partitionCount);
        const job = await tx.job.create({
          data: {
            id,
            queueId,
            type: jobInput.type,
            payload: jobInput.payload as Prisma.InputJsonValue,
            priority: jobInput.priority,
            runAt: new Date(),
            status: 'queued',
            maxAttempts: DEFAULT_MAX_ATTEMPTS,
            batchId: batch.id,
            partitionKey,
          },
        });
        await tx.executionEvent.create({
          data: { jobId: job.id, eventType: 'created', attemptNumber: 0, metadata: { batchId: batch.id } },
        });
        await tx.executionEvent.create({
          data: { jobId: job.id, eventType: 'queued', attemptNumber: 0, metadata: {} },
        });
      }
      return batch;
    });
  },

  async getForUser(batchId: string, userId: string) {
    const batch = await jobBatchesRepository.findById(batchId);
    if (!batch) throw AppError.notFound();
    const queue = await prisma.queue.findUnique({ where: { id: batch.queueId }, include: { project: true } });
    if (!queue) throw AppError.notFound();
    const membership = await organizationsRepository.getMembership(queue.project.organizationId, userId);
    if (!membership) throw AppError.notFound();
    return batch;
  },
};
