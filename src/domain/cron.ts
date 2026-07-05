import parser from 'cron-parser';
import { DateTime } from 'luxon';

// Section 7.3: cron is evaluated in the definition's stored IANA timezone,
// not server-local or blind UTC — this is what gets daylight-saving
// transitions right instead of firing an hour off twice a year.
export function cronNextFireTime(cronExpression: string, timezone: string, from: Date = new Date()): Date {
  const interval = parser.parseExpression(cronExpression, {
    currentDate: from,
    tz: timezone,
  });
  return interval.next().toDate();
}

// Section 7.4 / 11.15: pure read, no database write — used by the dashboard's
// schedule-creation form so an operator can confirm what a cron string means
// before saving.
export function cronPreview(cronExpression: string, timezone: string, count: number, from: Date = new Date()): Date[] {
  const interval = parser.parseExpression(cronExpression, { currentDate: from, tz: timezone });
  const occurrences: Date[] = [];
  for (let i = 0; i < count; i += 1) {
    occurrences.push(interval.next().toDate());
  }
  return occurrences;
}

export function isValidCronExpression(cronExpression: string): boolean {
  try {
    parser.parseExpression(cronExpression);
    return true;
  } catch {
    return false;
  }
}

export function isValidTimezone(timezone: string): boolean {
  return DateTime.local().setZone(timezone).isValid;
}
