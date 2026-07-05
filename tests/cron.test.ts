import { describe, expect, it } from 'vitest';
import { cronNextFireTime, cronPreview, isValidCronExpression, isValidTimezone } from '../src/domain/cron';

describe('cron helpers (Section 7.3/7.4)', () => {
  it('computes the next fire time for a simple every-5-minutes expression', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const next = cronNextFireTime('*/5 * * * *', 'UTC', from);
    expect(next.toISOString()).toBe('2026-01-01T00:05:00.000Z');
  });

  it('respects a non-UTC timezone when computing next fire time', () => {
    // 9am America/New_York in January (EST, UTC-5) is 14:00 UTC.
    const from = new Date('2026-01-15T00:00:00Z');
    const next = cronNextFireTime('0 9 * * *', 'America/New_York', from);
    expect(next.toISOString()).toBe('2026-01-15T14:00:00.000Z');
  });

  it('preview returns the requested number of future occurrences in order', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const occurrences = cronPreview('0 * * * *', 'UTC', 3, from);
    expect(occurrences).toHaveLength(3);
    expect(occurrences[0] < occurrences[1]).toBe(true);
    expect(occurrences[1] < occurrences[2]).toBe(true);
  });

  it('rejects an invalid cron expression', () => {
    expect(isValidCronExpression('not a cron expression')).toBe(false);
    expect(isValidCronExpression('*/5 * * * *')).toBe(true);
  });

  it('rejects an invalid IANA timezone', () => {
    expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
  });
});
