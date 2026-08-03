/**
 * Day handling. Every stored day is a local `YYYY-MM-DD` string rather than a
 * timestamp, because "did I do my exercises today" is a question about the
 * user's calendar, not about UTC. Exercising at 11pm should not land on
 * tomorrow, and traveling should not silently break a streak.
 */

export type DayKey = string;

export function dayKey(date: Date = new Date()): DayKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today(): DayKey {
  return dayKey();
}

export function parseDay(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(key: DayKey, delta: number): DayKey {
  const date = parseDay(key);
  date.setDate(date.getDate() + delta);
  return dayKey(date);
}

/** Oldest first. */
export function lastNDays(n: number, end: DayKey = today()): DayKey[] {
  const out: DayKey[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}

export function weekdayOf(key: DayKey): number {
  return parseDay(key).getDay();
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function formatDay(key: DayKey, opts: Intl.DateTimeFormatOptions = {}): string {
  return parseDay(key).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...opts,
  });
}

export function friendlyDay(key: DayKey): string {
  if (key === today()) return 'Today';
  if (key === addDays(today(), -1)) return 'Yesterday';
  if (key === addDays(today(), 1)) return 'Tomorrow';
  return formatDay(key);
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function daysBetween(a: DayKey, b: DayKey): number {
  const ms = parseDay(b).getTime() - parseDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
