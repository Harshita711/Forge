import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '../src/lib/prisma';
import { jobsRepository } from '../src/api/repositories/jobs.repository';

const hasDb = Boolean(process.env.DATABASE_URL);

// Section 9.1's entire reason to exist: prove that N workers racing to claim
// from the same queue at the same instant never both succeed on the same
// row. This is the single most important correctness property in the whole
// system, so it gets a dedicated concurrency test rather than resting on
// the SKIP LOCKED SQL "looking right."
describe.skipIf(!hasDb)('Atomic claim query — concurrency guarantee (Section 9.1)', () => {
  let orgId: string;
  let projectId: string;
  let queueId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const org = await prisma.organization.create({ data: { name: 'Claim Test Org', slug: `claim-test-${randomUUID()}` } });
    orgId = org.id;
    const project = await prisma.project.create({ data: { organizationId: orgId, name: 'p', slug: `p-${randomUUID()}` } });
    projectId = project.id;
    const queue = await prisma.queue.create({
      data: { projectId, name: 'q', slug: `q-${randomUUID()}`, concurrencyLimit: 50 },
    });
    queueId = queue.id;
  });

  afterAll(async () => {
    await prisma.job.deleteMany({ where: { queueId } });
    await prisma.queue.deleteMany({ where: { id: queueId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.$disconnect();
  });

  it('never lets two concurrent claimers both succeed on a single queued job', async () => {
    const job = await prisma.job.create({
      data: { queueId, type: 'demo:echo', payload: {}, status: 'queued', maxAttempts: 5 },
    });

    const fakeWorkerIds = Array.from({ length: 10 }, () => randomUUID());
    const results = await Promise.all(
      fakeWorkerIds.map((workerId) => jobsRepository.claimNextJob(queueId, workerId, 30))
    );

    const successfulClaims = results.filter((r) => r !== null);
    expect(successfulClaims).toHaveLength(1);
    expect(successfulClaims[0]!.id).toBe(job.id);

    const row = await prisma.job.findUnique({ where: { id: job.id } });
    expect(row!.status).toBe('claimed');
    expect(row!.attemptCount).toBe(1); // incremented exactly once, not 10 times
  });

  it('claims jobs in priority order, highest first', async () => {
    const low = await prisma.job.create({ data: { queueId, type: 'demo:echo', payload: {}, status: 'queued', maxAttempts: 5, priority: 0 } });
    const high = await prisma.job.create({ data: { queueId, type: 'demo:echo', payload: {}, status: 'queued', maxAttempts: 5, priority: 10 } });

    const claimed = await jobsRepository.claimNextJob(queueId, randomUUID(), 30);
    expect(claimed!.id).toBe(high.id);

    const claimedSecond = await jobsRepository.claimNextJob(queueId, randomUUID(), 30);
    expect(claimedSecond!.id).toBe(low.id);
  });

  it('never claims a job whose run_at is still in the future', async () => {
    await prisma.job.create({
      data: {
        queueId,
        type: 'demo:echo',
        payload: {},
        status: 'queued',
        maxAttempts: 5,
        runAt: new Date(Date.now() + 60_000),
      },
    });
    const claimed = await jobsRepository.claimNextJob(queueId, randomUUID(), 30);
    expect(claimed).toBeNull();
  });
});
