import { describe, expect, it } from 'vitest';
import { computeDelaySeconds, classifyFailure, PermanentError } from '../src/domain/retry';

const basePolicy = { strategy: 'fixed' as const, baseDelaySeconds: 10, maxDelaySeconds: 3600, jitter: false };

describe('retry delay formulas (Table 39)', () => {
  it('fixed strategy always returns base_delay regardless of attempt', () => {
    expect(computeDelaySeconds('fixed', 1, basePolicy)).toBe(10);
    expect(computeDelaySeconds('fixed', 5, basePolicy)).toBe(10);
  });

  it('linear strategy scales delay by attempt number', () => {
    expect(computeDelaySeconds('linear', 1, basePolicy)).toBe(10);
    expect(computeDelaySeconds('linear', 3, basePolicy)).toBe(30);
  });

  it('exponential strategy doubles each attempt and caps at max_delay', () => {
    expect(computeDelaySeconds('exponential', 1, basePolicy)).toBe(10); // 10 * 2^0
    expect(computeDelaySeconds('exponential', 2, basePolicy)).toBe(20); // 10 * 2^1
    expect(computeDelaySeconds('exponential', 3, basePolicy)).toBe(40); // 10 * 2^2
    const capped = { ...basePolicy, maxDelaySeconds: 25 };
    expect(computeDelaySeconds('exponential', 3, capped)).toBe(25); // would be 40, capped to 25
  });

  it('adaptive strategy resolves to exponential for transient failures', () => {
    expect(computeDelaySeconds('adaptive', 2, basePolicy, 'transient')).toBe(20);
  });

  it('jitter stays within +/-20% of the unjittered delay', () => {
    const jitterPolicy = { ...basePolicy, jitter: true };
    for (const rand of [0, 0.25, 0.5, 0.75, 1]) {
      const delay = computeDelaySeconds('fixed', 1, jitterPolicy, 'transient', { jitterRandom: () => rand });
      expect(delay).toBeGreaterThanOrEqual(8); // 10 - 20%
      expect(delay).toBeLessThanOrEqual(12); // 10 + 20%
    }
  });

  it('jitter never produces a negative delay', () => {
    const jitterPolicy = { ...basePolicy, baseDelaySeconds: 1, jitter: true };
    const delay = computeDelaySeconds('fixed', 1, jitterPolicy, 'transient', { jitterRandom: () => 0 });
    expect(delay).toBeGreaterThanOrEqual(0);
  });
});

describe('failure classification (Section 10.2)', () => {
  it('classifies a PermanentError as permanent', () => {
    expect(classifyFailure(new PermanentError('bad input'))).toBe('permanent');
  });

  it('classifies an ordinary Error as transient', () => {
    expect(classifyFailure(new Error('ECONNRESET'))).toBe('transient');
  });

  it('classifies a non-Error throw as transient (safe default)', () => {
    expect(classifyFailure('a string was thrown')).toBe('transient');
  });
});
