import { describe, expect, it } from 'vitest';
import { fnv1aHash, partitionKeyForJobId } from '../src/domain/partitioning';

describe('partition key assignment (Section 11.2)', () => {
  it('returns undefined when the queue has no partitioning configured', () => {
    expect(partitionKeyForJobId('11111111-1111-1111-1111-111111111111', 1)).toBeUndefined();
  });

  it('is deterministic: the same job id always maps to the same partition', () => {
    const id = 'abc-123-def-456';
    const first = partitionKeyForJobId(id, 8);
    const second = partitionKeyForJobId(id, 8);
    expect(first).toBe(second);
  });

  it('always returns a value within [0, partitionCount)', () => {
    for (let i = 0; i < 200; i += 1) {
      const key = partitionKeyForJobId(`job-${i}`, 4);
      expect(key).toBeGreaterThanOrEqual(0);
      expect(key).toBeLessThan(4);
    }
  });

  it('distributes a spread of ids across all partitions (no obvious skew)', () => {
    const counts = new Array(8).fill(0);
    for (let i = 0; i < 1000; i += 1) {
      const key = partitionKeyForJobId(`job-${i}-${Math.random()}`, 8)!;
      counts[key] += 1;
    }
    // With 1000 samples across 8 partitions, a healthy hash keeps every
    // bucket within a wide but meaningful band around the 125 average.
    for (const count of counts) {
      expect(count).toBeGreaterThan(50);
      expect(count).toBeLessThan(250);
    }
  });

  it('fnv1aHash is a pure function of its input', () => {
    expect(fnv1aHash('same-input')).toBe(fnv1aHash('same-input'));
    expect(fnv1aHash('input-a')).not.toBe(fnv1aHash('input-b'));
  });
});
