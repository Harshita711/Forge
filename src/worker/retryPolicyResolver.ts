import { prisma } from '../lib/prisma';
import { RetryPolicyLike, RetryStrategy } from '../domain/retry';

// Section 10.1: "a job without an explicit retry_policy_id inherits its
// queue's default_retry_policy_id; a queue without one falls back to a
// system default of exponential backoff, base 5s, max 3600s, jitter on."
const SYSTEM_DEFAULT_RETRY_POLICY: RetryPolicyLike = {
  strategy: 'exponential',
  baseDelaySeconds: 5,
  maxDelaySeconds: 3600,
  jitter: true,
};

export async function resolveEffectiveRetryPolicy(
  retryPolicyId: string | null,
  queueId: string
): Promise<RetryPolicyLike> {
  if (retryPolicyId) {
    const policy = await prisma.retryPolicy.findUnique({ where: { id: retryPolicyId } });
    // The DB column is a plain string (validated at write time by the API's
    // zod schema — Section 6's retry policy create/update endpoints — not by
    // a Postgres enum), so it needs a narrowing cast back to RetryStrategy here.
    if (policy) return { ...policy, strategy: policy.strategy as RetryStrategy };
  }
  const queue = await prisma.queue.findUnique({ where: { id: queueId } });
  if (queue?.defaultRetryPolicyId) {
    const policy = await prisma.retryPolicy.findUnique({ where: { id: queue.defaultRetryPolicyId } });
    if (policy) return { ...policy, strategy: policy.strategy as RetryStrategy };
  }
  return SYSTEM_DEFAULT_RETRY_POLICY;
}
