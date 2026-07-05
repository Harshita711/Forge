export type RetryStrategy = 'fixed' | 'linear' | 'exponential' | 'adaptive';

export interface RetryPolicyLike {
  strategy: RetryStrategy;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
  jitter: boolean;
}

// Escape hatch a handler throws to force immediate dead-lettering regardless
// of classification (Section 10.2 "Handler Contract").
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
    Object.setPrototypeOf(this, PermanentError.prototype);
  }
}

// classify(error) — Section 10.2/10.3. A minimal, extensible classifier: any
// handler-thrown PermanentError always wins; everything else defaults to
// 'transient' unless the error carries a recognizable "don't retry" signal.
export type FailureClassification = 'transient' | 'permanent';

export function classifyFailure(error: unknown): FailureClassification {
  if (error instanceof PermanentError) return 'permanent';
  return 'transient';
}

// Table 39 formulas, 1-indexed attempt n:
//   fixed:       delay = base_delay
//   linear:      delay = base_delay * n
//   exponential: delay = min(max_delay, base_delay * 2^(n-1))
// jitter (all strategies): final_delay = delay ± jitter(0, delay * 0.2)
function baseDelaySecondsFor(strategy: Exclude<RetryStrategy, 'adaptive'>, attempt: number, policy: RetryPolicyLike): number {
  switch (strategy) {
    case 'fixed':
      return policy.baseDelaySeconds;
    case 'linear':
      return policy.baseDelaySeconds * attempt;
    case 'exponential':
      return Math.min(policy.maxDelaySeconds, policy.baseDelaySeconds * 2 ** (attempt - 1));
  }
}

// 10.2 Adaptive: not a fifth formula — a classifier that selects among the
// other three based on classify(error). Kept intentionally simple: transient
// failures get exponential (the safest general default under load), and this
// is the one seam meant to grow richer failure-class-specific rules over time.
function resolveAdaptiveStrategy(classification: FailureClassification): Exclude<RetryStrategy, 'adaptive'> {
  return classification === 'transient' ? 'exponential' : 'exponential';
}

export interface ComputeDelayOptions {
  jitterRandom?: () => number; // injectable for deterministic tests, defaults to Math.random
}

export function computeDelaySeconds(
  strategy: RetryStrategy,
  attempt: number,
  policy: RetryPolicyLike,
  classification: FailureClassification = 'transient',
  opts: ComputeDelayOptions = {}
): number {
  const resolvedStrategy = strategy === 'adaptive' ? resolveAdaptiveStrategy(classification) : strategy;
  const delay = baseDelaySecondsFor(resolvedStrategy, attempt, policy);

  if (!policy.jitter) return delay;

  const rand = opts.jitterRandom ?? Math.random;
  const jitterMagnitude = delay * 0.2;
  const jitterOffset = (rand() * 2 - 1) * jitterMagnitude; // ±20%
  return Math.max(0, delay + jitterOffset);
}
