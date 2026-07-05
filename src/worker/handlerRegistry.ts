import { PermanentError } from '../domain/retry';

export interface JobContext {
  jobId: string;
  attemptCount: number;
  idempotencyKey: string | null;
}

export type JobHandler = (payload: Record<string, unknown>, context: JobContext) => Promise<unknown>;

// Section 8.6 — the handler-authoring contract: handlers receive job.id and
// job.idempotency_key so they can make their own side effects idempotent
// (e.g. UPSERT keyed on job.id) under Forge's at-least-once delivery guarantee.
const registry = new Map<string, JobHandler>();

export function registerHandler(type: string, handler: JobHandler): void {
  registry.set(type, handler);
}

export function getHandler(type: string): JobHandler | undefined {
  return registry.get(type);
}

// Demo handlers — enough to exercise the full claim/execute/retry/DLQ/replay
// path end-to-end in a fresh checkout without any external system.
registerHandler('demo:echo', async (payload) => {
  return { echoed: payload };
});

registerHandler('demo:always-fail', async () => {
  throw new Error('demo:always-fail always throws, by design, to exercise retry/DLQ');
});

registerHandler('demo:permanent-fail', async () => {
  throw new PermanentError('demo:permanent-fail always throws PermanentError, to exercise immediate dead-lettering');
});

registerHandler('demo:flaky', async (payload, context) => {
  // Fails on the first two attempts, succeeds from the third — useful for
  // manually watching a job walk through retrying -> queued -> completed.
  if (context.attemptCount < 3) {
    throw new Error(`demo:flaky failing on attempt ${context.attemptCount}`);
  }
  return { succeededOnAttempt: context.attemptCount, payload };
});
