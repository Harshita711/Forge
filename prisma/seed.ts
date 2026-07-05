import 'dotenv/config';
import argon2 from 'argon2';
import { prisma } from '../src/lib/prisma';
import { organizationsRepository } from '../src/api/repositories/organizations.repository';

// Section 17.5 — full seed: a demo account, a project with three queues each
// configured differently (to show off priority/concurrency/partitioning/retry
// policy variety), a cron schedule, a batch, and a couple of DLQ entries so
// the dashboard has something to show immediately after `docker compose up`.
async function main() {
  const email = 'demo@forge.local';
  const password = 'demo-password-123';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Seed user ${email} already exists — skipping (delete the user row to reseed).`);
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.create({ data: { email, passwordHash, fullName: 'Demo Operator' } });
  const org = await organizationsRepository.createWithOwner('Acme Corp', user.id);

  const project = await prisma.project.create({
    data: { organizationId: org.id, name: 'Backend', slug: 'backend', createdBy: user.id },
  });

  const aggressiveRetry = await prisma.retryPolicy.create({
    data: {
      organizationId: org.id,
      name: 'Aggressive exponential',
      strategy: 'exponential',
      baseDelaySeconds: 2,
      maxDelaySeconds: 60,
      maxAttempts: 6,
      jitter: true,
    },
  });

  const conservativeRetry = await prisma.retryPolicy.create({
    data: {
      organizationId: org.id,
      name: 'Conservative fixed',
      strategy: 'fixed',
      baseDelaySeconds: 30,
      maxDelaySeconds: 30,
      maxAttempts: 3,
      jitter: false,
    },
  });

  // Queue 1: high-priority webhook delivery, tight concurrency, fast retries.
  const webhookQueue = await prisma.queue.create({
    data: {
      projectId: project.id,
      name: 'payments-webhook',
      slug: 'payments-webhook',
      priorityWeight: 10,
      concurrencyLimit: 20,
      visibilityTimeoutSeconds: 15,
      defaultRetryPolicyId: aggressiveRetry.id,
    },
  });

  // Queue 2: low-priority batch email digests, generous timeout, patient retries.
  const emailQueue = await prisma.queue.create({
    data: {
      projectId: project.id,
      name: 'email-digest',
      slug: 'email-digest',
      priorityWeight: 1,
      concurrencyLimit: 5,
      visibilityTimeoutSeconds: 60,
      defaultRetryPolicyId: conservativeRetry.id,
    },
  });

  // Queue 3: partitioned queue demonstrating Section 11.2 sharding.
  const analyticsQueue = await prisma.queue.create({
    data: {
      projectId: project.id,
      name: 'analytics-ingest',
      slug: 'analytics-ingest',
      priorityWeight: 5,
      concurrencyLimit: 30,
      partitionCount: 4,
      visibilityTimeoutSeconds: 30,
    },
  });

  // A cron schedule on the webhook queue — fires every 5 minutes.
  await prisma.scheduledDefinition.create({
    data: {
      queueId: webhookQueue.id,
      jobType: 'demo:echo',
      payloadTemplate: { source: 'cron-seed' },
      scheduleType: 'cron',
      cronExpression: '*/5 * * * *',
      timezone: 'UTC',
      nextRunAt: new Date(Date.now() + 60_000),
      createdBy: user.id,
    },
  });

  // A handful of immediate jobs across a few outcomes so the dashboard's Jobs
  // tab and DLQ inbox aren't empty on first login. The worker process (not
  // this script) is what actually executes and transitions these — this
  // just submits them, exactly like a real client would via POST /jobs.
  const sampleJobs: { queueId: string; type: string; payload: Record<string, unknown> }[] = [
    { queueId: webhookQueue.id, type: 'demo:echo', payload: { orderId: 'ord_1' } },
    { queueId: webhookQueue.id, type: 'demo:echo', payload: { orderId: 'ord_2' } },
    { queueId: webhookQueue.id, type: 'demo:flaky', payload: { orderId: 'ord_3' } },
    { queueId: emailQueue.id, type: 'demo:echo', payload: { digestFor: 'week-27' } },
    { queueId: analyticsQueue.id, type: 'demo:echo', payload: { eventBatch: 1 } },
  ];

  for (const j of sampleJobs) {
    const job = await prisma.job.create({
      data: { queueId: j.queueId, type: j.type, payload: j.payload, status: 'queued', maxAttempts: 5, runAt: new Date() },
    });
    await prisma.executionEvent.create({ data: { jobId: job.id, eventType: 'created', attemptNumber: 0, metadata: {} } });
    await prisma.executionEvent.create({ data: { jobId: job.id, eventType: 'queued', attemptNumber: 0, metadata: {} } });
  }

  // A pre-populated DLQ entry so the DLQ tab and AI-summary feature are
  // demoable without waiting for demo:always-fail to exhaust its retries live.
  const deadJob = await prisma.job.create({
    data: {
      queueId: webhookQueue.id,
      type: 'demo:always-fail',
      payload: { orderId: 'ord_dead' },
      status: 'dead_letter',
      maxAttempts: 3,
      attemptCount: 3,
      runAt: new Date(),
      lastError: 'demo:always-fail always throws, by design, to exercise retry/DLQ',
      failedAt: new Date(),
    },
  });
  await prisma.deadLetterQueueEntry.create({
    data: {
      originalJobId: deadJob.id,
      queueId: webhookQueue.id,
      type: deadJob.type,
      payload: deadJob.payload as Record<string, unknown>,
      failureReason: 'demo:always-fail always throws, by design, to exercise retry/DLQ',
      attemptCount: 3,
    },
  });

  console.log('Seed complete:');
  console.log(`  user:     ${email} / ${password}`);
  console.log(`  org:      ${org.name} (${org.slug})`);
  console.log(`  project:  ${project.name} (${project.slug})`);
  console.log(`  queues:   ${webhookQueue.slug}, ${emailQueue.slug}, ${analyticsQueue.slug} (4 partitions)`);
  console.log(`  jobs:     ${sampleJobs.length} queued, 1 pre-populated in the DLQ`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
