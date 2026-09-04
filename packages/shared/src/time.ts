// Ghana time utilities — BranchPort operates in GMT+0 (West Africa Time).
// All timestamps are stored as ISO 8601 strings in UTC. Display functions
// format them in Ghana local time.

const GHANA_TZ = 'Africa/Accra';

/** Current ISO timestamp in UTC (for storage). */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Format a date for display in Ghana local time. */
export function ghFormatDate(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    timeZone: GHANA_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts,
  });
}

/** Format a date+time for display in Ghana local time. */
export function ghFormatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    timeZone: GHANA_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Format just the time in Ghana local time. */
export function ghFormatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', {
    timeZone: GHANA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Format a date for <input type="date"> in Ghana local time. */
export function ghInputDate(iso: string): string {
  const d = new Date(iso);
  const parts = d.toLocaleDateString('en-CA', { timeZone: GHANA_TZ }); // YYYY-MM-DD
  return parts;
}

/** Get Ghana local "start of today" in ISO. */
export function ghStartOfToday(): string {
  const now = new Date();
  // Ghana is UTC+0, so just zero out hours/minutes/seconds/ms
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  return d.toISOString();
}

/** Get Ghana local "start of this week" (Sunday) in ISO. */
export function ghStartOfWeek(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day, 0, 0, 0, 0));
  return d.toISOString();
}

/** Get Ghana local "start of this month" in ISO. */
export function ghStartOfMonth(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  return d.toISOString();
}

/** Get Ghana local date string for day offsets (negative = past). */
export function ghDaysAgo(days: number, hours = 10): string {
  const d = new Date(Date.now() - days * 86400000 - hours * 3600000);
  return d.toISOString();
}
