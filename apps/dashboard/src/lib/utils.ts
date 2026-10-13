// Small client-side helpers shared across the dashboard screens.

// ── POS-first greeting ────────────────────────────────────────────────────
// Every account is greeted with the point-of-sale before it reaches a role
// home: owner signups, and staff/manager accounts the first time they sign
// in after being provisioned. Keyed by user id so a shared device never
// suppresses one account's greeting with another's, and scoped to this
// device so a fresh install greets again. A storage failure reports "seen"
// rather than trapping the user in the welcome screen.
const welcomeKey = (userId: string) => `bp-welcome-seen:${userId}`;

export function hasSeenWelcome(userId: string): boolean {
  try {
    return localStorage.getItem(welcomeKey(userId)) === '1';
  } catch {
    return true;
  }
}

export function markWelcomeSeen(userId: string): void {
  try {
    localStorage.setItem(welcomeKey(userId), '1');
  } catch {
    /* quota or private mode — the greeting simply repeats next time */
  }
}

export function formatGHS(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `GHS ${v.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ISO local midnight for a given offset-in-days (negative = past).
export function localStartOfDayOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function startOfToday(): string {
  return localStartOfDayOffset(0);
}

export function startOfWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // Sunday start
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}