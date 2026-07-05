import { jobsRepository } from '../api/repositories/jobs.repository';
import { executionEventsRepository } from '../api/repositories/executionEvents.repository';
import { dlqRepository } from '../api/repositories/dlq.repository';
import { jobBatchesRepository } from '../api/repositories/jobBatches.repository';
import { getHandler } from './handlerRegistry';
import { resolveEffectiveRetryPolicy } from './retryPolicyResolver';
import { classifyFailure, computeDelaySeconds } from '../domain/retry';
import { promoteDependentsIfSatisfied, cascadeCancelDependents } from '../api/services/jobs.service';
import type { ClaimedJobRow } from '../api/repositories/jobs.repository';
import { logger } from '../lib/logger';

// Figure 8.2, in full:
//   1. mark running, record 'started'
//   2. handler = registry[job.type]; missing handler is itself a permanent failure
//   3. try handler(payload, ctx)
//      success -> mark completed, record 'completed', promote DAG dependents,
//                 bump batch progress
//      failure -> classify; if attempt_count >= max_attempts OR classification
//                 is 'permanent' -> dead-letter + cascade-cancel dependents;
//                 else -> compute retry delay, mark retrying, record 'retry'
export async function executeJob(claimed: ClaimedJobRow, workerId: string): Promise<void> {
  await jobsRepository.markRunning(claimed.id);
  await executionEventsRepository.record(claimed.id, 'started', claimed.attempt_count, {}, workerId, claimed.queue_id);

  const handler = getHandler(claimed.type);
  if (!handler) {
    await handleFailure(claimed, workerId, new Error(`No handler registered for job type '${claimed.type}'`));
    return;
  }

  try {
    const result = await handler(claimed.payload, {
      jobId: claimed.id,
      attemptCount: claimed.attempt_count,
      idempotencyKey: claimed.idempotency_key,
    });
    await handleSuccess(claimed, workerId, result);
  } catch (err) {
    await handleFailure(claimed, workerId, err);
  }
}

async function handleSuccess(claimed: ClaimedJobRow, workerId: string, result: unknown): Promise<void> {
  await jobsRepository.markCompleted(claimed.id, result);
  await executionEventsRepository.record(
    claimed.id,
    'completed',
    claimed.attempt_count,
    { result },
    workerId,
    claimed.queue_id
  );
  await promoteDependentsIfSatisfied(claimed.id);
  if (claimed.batch_id) {
    await jobBatchesRepository.incrementProgress(claimed.batch_id, 'completed');
  }
}

async function handleFailure(claimed: ClaimedJobRow, workerId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const classification = classifyFailure(err);
  const exhausted = claimed.attempt_count >= claimed.max_attempts;

  logger.warn(
    { jobId: claimed.id, attempt: claimed.attempt_count, maxAttempts: claimed.max_attempts, classification },
    `Job execution failed: ${message}`
  );

  if (exhausted || classification === 'permanent') {
    await jobsRepository.markDeadLetter(claimed.id, message);
    await executionEventsRepository.record(
      claimed.id,
      'dead_lettered',
      claimed.attempt_count,
      { reason: message, classification },
      workerId,
      claimed.queue_id
    );
    await dlqRepository.create({
      originalJobId: claimed.id,
      queueId: claimed.queue_id,
      type: claimed.type,
      payload: claimed.payload,
      failureReason: message,
      attemptCount: claimed.attempt_count,
    });
    await cascadeCancelDependents(claimed.id, 'parent_dead_lettered');
    if (claimed.batch_id) {
      await jobBatchesRepository.incrementProgress(claimed.batch_id, 'failed');
    }
    return;
  }

  const policy = await resolveEffectiveRetryPolicy(claimed.retry_policy_id, claimed.queue_id);
  const delaySeconds = computeDelaySeconds(policy.strategy, claimed.attempt_count, policy, classification);
  const runAt = new Date(Date.now() + delaySeconds * 1000);

  await jobsRepository.markRetrying(claimed.id, runAt, message);
  await executionEventsRepository.record(
    claimed.id,
    'retry',
    claimed.attempt_count,
    { reason: message, delaySeconds, nextRunAt: runAt.toISOString(), classification },
    workerId,
    claimed.queue_id
  );
  // Section 10.3 stops here: status stays 'retrying' until the Scheduler's
  // promotion sweep (Section 7.2 — "same promotion mechanism as scheduled ->
  // queued") flips it back to 'queued' once run_at is reached. The claim
  // query only ever looks at status='queued', so a 'retrying' row is
  // correctly invisible to workers for the whole backoff window.
}