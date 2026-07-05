import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma';
import { partitionKeyForJobId } from '../../domain/partitioning';

export async function newJobIdentity(queueId: string): Promise<{ id: string; partitionKey: number | undefined }> {
  const id = randomUUID();
  const queue = await prisma.queue.findUnique({ where: { id: queueId }, select: { partitionCount: true } });
  const partitionKey = partitionKeyForJobId(id, queue?.partitionCount ?? 1);
  return { id, partitionKey };
}
