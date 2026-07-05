import { AppError } from '../../domain/errors';
import { dlqRepository } from '../repositories/dlq.repository';
import { jobsRepository } from '../repositories/jobs.repository';
import { executionEventsRepository } from '../repositories/executionEvents.repository';
import { organizationsRepository } from '../repositories/organizations.repository';
import { prisma } from '../../lib/prisma';
import { hasEffectivePermission } from './rbacResolution';
import { newJobIdentity } from './jobIdentity';
import { publishEvent } from '../../lib/eventBus';

export const dlqService = {
  async listForUser(queueId: string, userId: string) {
    const queue = await prisma.queue.findUnique({ where: { id: queueId }, include: { project: true } });
    if (!queue) throw AppError.notFound();
    const membership = await organizationsRepository.getMembership(queue.project.organizationId, userId);
    if (!membership) throw AppError.notFound();
    return dlqRepository.listUnresolvedForQueue(queueId);
  },

  async getForUser(id: string, userId: string) {
    const entry = await dlqRepository.findByIdWithSummaries(id);
    if (!entry) throw AppError.notFound();
    const queue = await prisma.queue.findUnique({ where: { id: entry.queueId }, include: { project: true } });
    if (!queue) throw AppError.notFound();
    const membership = await organizationsRepository.getMembership(queue.project.organizationId, userId);
    if (!membership) throw AppError.notFound();
    return { entry, membership };
  },

  // Section 10.4: retrying a DLQ entry creates a brand-new job row (never
  // mutates the dead-lettered original) — same additive philosophy as replay
  // (Section 11.12) — and lets the operator optionally edit the payload
  // (requires dlq:edit; a plain retry with the original payload only needs dlq:retry).
  async retry(id: string, userId: string, editedPayload?: Record<string, unknown>) {
    const { entry, membership } = await this.getForUser(id, userId);
    if (editedPayload && !await hasEffectivePermission(membership, 'dlq:edit')) {
      throw AppError.forbidden();
    }
    if (!editedPayload && !await hasEffectivePermission(membership, 'dlq:retry')) {
      throw AppError.forbidden();
    }
    if (entry.resolved) throw AppError.conflict('This DLQ entry has already been resolved');

    const { id: newJobIdValue, partitionKey } = await newJobIdentity(entry.queueId);
    const newJob = await jobsRepository.create({
      id: newJobIdValue,
      queueId: entry.queueId,
      type: entry.type,
      payload: editedPayload ?? (entry.payload as Record<string, unknown>),
      priority: 0,
      runAt: new Date(),
      status: 'queued',
      maxAttempts: entry.attemptCount + 5, // Section 10.4: fresh attempt budget on manual retry
      partitionKey,
    });
    await executionEventsRepository.record(
      newJob.id,
      'created',
      0,
      { retriedFromDlq: entry.id },
      undefined,
      newJob.queueId
    );
    await executionEventsRepository.record(newJob.id, 'queued', 0, {}, undefined, newJob.queueId);
    await dlqRepository.resolve(entry.id, userId, 'retried', newJob.id);
    // DLQ resolution changes the queue's DLQ inbox count and its overview
    // cards (Section 13) even though it isn't itself an execution_events
    // row — publish directly so the queue/dashboard rooms refresh live
    // instead of only updating once the new job's own events land.
    await publishEvent({
      type: 'queue:updated',
      queueId: entry.queueId,
      jobId: newJob.id,
      payload: { eventType: 'dlq_retried', dlqEntryId: entry.id, newJobId: newJob.id },
    });
    return newJob;
  },

  async dismiss(id: string, userId: string) {
    const { entry, membership } = await this.getForUser(id, userId);
    if (!await hasEffectivePermission(membership, 'dlq:edit')) throw AppError.forbidden();
    await dlqRepository.resolve(id, userId, 'dismissed');
    await publishEvent({
      type: 'queue:updated',
      queueId: entry.queueId,
      payload: { eventType: 'dlq_dismissed', dlqEntryId: id },
    });
  },
};