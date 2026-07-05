import crypto from 'crypto';
import { AppError } from '../../domain/errors';
import { CreateJobInput } from '../../domain/schemas';
import { jobsRepository } from '../repositories/jobs.repository';
import { queuesRepository } from '../repositories/queues.repository';
import { executionEventsRepository } from '../repositories/executionEvents.repository';
import { organizationsRepository } from '../repositories/organizations.repository';
import { publishEvent } from '../../lib/eventBus';
import { hasEffectivePermission } from './rbacResolution';
import { newJobIdentity } from './jobIdentity';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const DEFAULT_MAX_ATTEMPTS = 5;

// Section 11.1 cycle prevention: DFS from the proposed depends_on_job_id
// looking for a path back to jobId. A brand-new job (this delivery's only
// creation path) can never complete a cycle since nothing can depend on an
// id that didn't exist yet — this guard exists for when an "attach dependency
// to an existing job" endpoint is added, and is exercised here defensively.
async function wouldCreateCycle(jobId: string, proposedDependsOnJobId: string): Promise<boolean> {
  const visited = new Set<string>();
  async function dfs(currentId: string): Promise<boolean> {
    if (currentId === jobId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);
    const deps = await jobsRepository.dependenciesOf(currentId);
    for (const dep of deps) {
      if (await dfs(dep.dependsOnJobId)) return true;
    }
    return false;
  }
  return dfs(proposedDependsOnJobId);
}

export const jobsService = {
  async create(queueId: string, input: CreateJobInput, createdBy: string, idempotencyKey?: string) {
    if (idempotencyKey) {
      const existing = await jobsRepository.findByIdempotencyKey(queueId, idempotencyKey);
      if (existing) return existing; // Section 9.6 / 11.20: identical retried submission returns the original job
    }

    const hasDeps = !!input.dependsOnJobIds && input.dependsOnJobIds.length > 0;
    const runAt = input.runAt ? new Date(input.runAt) : new Date();

    if (hasDeps) {
      for (const depId of input.dependsOnJobIds!) {
        const dep = await jobsRepository.findById(depId);
        if (!dep || dep.queueId !== queueId) {
          throw AppError.validation(`dependsOnJobIds references a job (${depId}) not found in this queue`);
        }
      }
    }

    const job = await prisma.$transaction(async (tx) => {
      const { id, partitionKey } = await newJobIdentity(queueId);
      const created = await tx.job.create({
        data: {
          id,
          queueId,
          type: input.type,
          payload: input.payload as Prisma.InputJsonValue,
          priority: input.priority,
          runAt,
          status: hasDeps ? 'pending' : 'queued',
          maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
          retryPolicyId: input.retryPolicyId,
          idempotencyKey,
          createdBy,
          partitionKey,
        },
      });

      if (hasDeps) {
        for (const depId of input.dependsOnJobIds!) {
          if (await wouldCreateCycle(created.id, depId)) {
            throw AppError.unprocessable('Dependency graph would contain a cycle', [{ dependsOnJobId: depId }]);
          }
          await tx.jobDependency.create({ data: { jobId: created.id, dependsOnJobId: depId } });
        }
      }
      return created;
    });

    await executionEventsRepository.record(job.id, 'created', 0, { hasDeps }, undefined, job.queueId);
    if (!hasDeps) {
      await executionEventsRepository.record(job.id, 'queued', 0, { reason: 'no_dependencies' }, undefined, job.queueId);
    }
    return job;
  },

  async getForUser(jobId: string, userId: string) {
    const job = await jobsRepository.findById(jobId);
    if (!job) throw AppError.notFound();
    const membership = await organizationsRepository.getMembership(job.queue.project.organizationId, userId);
    if (!membership) throw AppError.notFound();
    return { job, membership };
  },

  list(queueId: string, filter: { status?: string; type?: string }, cursor?: string, limit = 25) {
    return jobsRepository.listForQueue(queueId, filter, cursor, limit);
  },

  events(jobId: string) {
    return executionEventsRepository.timelineForJob(jobId);
  },

  async cancel(jobId: string, userId: string) {
    const { job, membership } = await this.getForUser(jobId, userId);
    if (!await hasEffectivePermission(membership, 'job:cancel')) throw AppError.forbidden();
    if (!['pending', 'scheduled', 'queued', 'retrying'].includes(job.status)) {
      throw AppError.conflict(`Job in status '${job.status}' cannot be cancelled`);
    }
    await jobsRepository.markCancelled(jobId, 'Cancelled by operator');
    await executionEventsRepository.record(jobId, 'cancelled', job.attemptCount, { actor: userId }, undefined, job.queueId);
    await cascadeCancelDependents(jobId, 'parent_cancelled');
  },

  // Section 11.12 — Execution Replay. Additive: the original row and its
  // execution_events history are never modified, so replay is safe to use
  // for reproducing an incident without destroying evidence of what happened.
  async replay(jobId: string, userId: string) {
    const { job, membership } = await this.getForUser(jobId, userId);
    if (!await hasEffectivePermission(membership, 'job:replay')) throw AppError.forbidden();
    if (!['completed', 'failed', 'dead_letter', 'cancelled'].includes(job.status)) {
      throw AppError.conflict('Only a terminal job can be replayed');
    }
    const { id, partitionKey } = await newJobIdentity(job.queueId);
    const replayed = await jobsRepository.create({
      id,
      queueId: job.queueId,
      type: job.type,
      payload: job.payload as Record<string, unknown>,
      priority: job.priority,
      runAt: new Date(),
      status: 'queued',
      maxAttempts: job.maxAttempts,
      retryPolicyId: job.retryPolicyId ?? undefined,
      createdBy: userId,
      partitionKey,
    });
    await prisma.job.update({ where: { id: replayed.id }, data: { parentJobId: job.id } });
    await executionEventsRepository.record(
      replayed.id,
      'created',
      0,
      { replayedFrom: job.id },
      undefined,
      replayed.queueId
    );
    await executionEventsRepository.record(replayed.id, 'queued', 0, {}, undefined, replayed.queueId);
    // The original job's own room may still be watched by a job detail
    // drawer open on this exact job (Section 11.12). Its status never
    // changes again, so push a plain realtime notice (not a fake execution
    // event on its timeline) carrying the new job's id, letting the
    // frontend redirect to it instead of continuing to show a stale job.
    await publishEvent({
      type: 'job:updated',
      jobId: job.id,
      queueId: job.queueId,
      payload: { eventType: 'replayed', replayedAsJobId: replayed.id },
    });
    return replayed;
  },

  queueStatsGuard: queuesRepository.latestMetricsSnapshot,
};

// Section 11.1 parent-failure cascade: when a job reaches dead_letter or
// cancelled, every dependent transitions to cancelled with a traceable
// reason, then recurses onto that dependent's own dependents — a downstream
// chain is cancelled in one pass instead of each link discovering it separately.
export async function cascadeCancelDependents(failedJobId: string, reason: string): Promise<void> {
  const dependents = await jobsRepository.dependentsOf(failedJobId);
  for (const dep of dependents) {
    const dependentJob = await jobsRepository.findById(dep.jobId);
    if (!dependentJob || ['completed', 'cancelled', 'dead_letter'].includes(dependentJob.status)) continue;
    await jobsRepository.markCancelled(dep.jobId, `${reason} (parent_job_id=${failedJobId})`);
    await executionEventsRepository.record(
      dep.jobId,
      'cancelled',
      dependentJob.attemptCount,
      { reason, parentJobId: failedJobId },
      undefined,
      dependentJob.queueId
    );
    await cascadeCancelDependents(dep.jobId, 'ancestor_failed');
  }
}

// Called on a parent job's successful completion (worker side): promotes any
// dependent whose dependencies are now all satisfied (Section 6, row
// "pending → scheduled/queued").
export async function promoteDependentsIfSatisfied(completedJobId: string): Promise<void> {
  const dependents = await jobsRepository.dependentsOf(completedJobId);
  for (const dep of dependents) {
    const remaining = await jobsRepository.unsatisfiedDependencyCount(dep.jobId);
    if (remaining === 0) {
      const dependentJob = await jobsRepository.findById(dep.jobId);
      if (!dependentJob || dependentJob.status !== 'pending') continue;
      const nowDue = dependentJob.runAt <= new Date();
      await jobsRepository.updateStatus(dep.jobId, nowDue ? 'queued' : 'scheduled');
      await executionEventsRepository.record(
        dep.jobId,
        'queued',
        dependentJob.attemptCount,
        { reason: 'dependencies_satisfied' },
        undefined,
        dependentJob.queueId
      );
    }
  }
}

export function newIdempotencyKeyFromRequest(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}