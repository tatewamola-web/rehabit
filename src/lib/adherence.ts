/**
 * Turning prescriptions + logs into "what's due today" and "how am I doing".
 *
 * A deliberate choice about streaks: a day where nothing was prescribed does
 * not break one, and a partly-finished day still counts. Rehab is measured in
 * months, and a counter that resets to zero for one bad afternoon teaches
 * people to stop opening the app. Honest, not punishing.
 */
import { addDays, lastNDays, today, weekdayOf, type DayKey } from './dates';
import type { Prescription, SessionLog } from './types';

export interface DueItem {
  prescription: Prescription;
  /** How many bouts the prescription asks for on this day. */
  target: number;
  /** Bouts actually logged. Can exceed target — extra credit is fine. */
  done: number;
  sessions: SessionLog[];
}

export function isDueOn(rx: Prescription, day: DayKey): boolean {
  if (!rx.active) return false;
  if (!rx.daysOfWeek?.length) return true;
  return rx.daysOfWeek.includes(weekdayOf(day));
}

export function dueOnDay(
  prescriptions: Prescription[],
  sessions: SessionLog[],
  day: DayKey,
): DueItem[] {
  const onDay = sessions.filter((s) => s.day === day);
  return prescriptions
    .filter((rx) => isDueOn(rx, day))
    .map((rx) => {
      const mine = onDay.filter((s) => s.prescriptionId === rx.id);
      return {
        prescription: rx,
        target: Math.max(1, rx.timesPerDay || 1),
        done: mine.length,
        sessions: mine,
      };
    });
}

export interface DayStats {
  day: DayKey;
  /** Total bouts prescribed for the day. */
  due: number;
  /** Bouts completed against prescriptions, capped at what was due. */
  done: number;
  /** Anything logged at all, including exercises done off-plan. */
  logged: number;
  /** 0–1. A day with nothing due is `null`, not zero. */
  completion: number | null;
}

export function statsForDay(
  prescriptions: Prescription[],
  sessions: SessionLog[],
  day: DayKey,
): DayStats {
  const items = dueOnDay(prescriptions, sessions, day);
  const due = items.reduce((n, i) => n + i.target, 0);
  const done = items.reduce((n, i) => n + Math.min(i.done, i.target), 0);
  const logged = sessions.filter((s) => s.day === day).length;
  return { day, due, done, logged, completion: due ? done / due : null };
}

export function statsForRange(
  prescriptions: Prescription[],
  sessions: SessionLog[],
  days: DayKey[],
): DayStats[] {
  return days.map((d) => statsForDay(prescriptions, sessions, d));
}

/**
 * Consecutive days of *showing up*. A day counts if at least one session was
 * logged; a day with nothing prescribed is skipped over rather than counted or
 * broken; and not having done today's yet does not end the streak until the day
 * is actually over.
 */
export function computeStreak(prescriptions: Prescription[], sessions: SessionLog[]): number {
  const logged = new Set(sessions.map((s) => s.day));
  let day = today();
  let streak = 0;

  // Today in progress: don't punish it, just start counting from yesterday.
  if (!logged.has(day)) day = addDays(day, -1);

  for (let guard = 0; guard < 400; guard++) {
    const anythingDue = prescriptions.some((rx) => isDueOn(rx, day));
    if (logged.has(day)) {
      streak++;
    } else if (anythingDue) {
      break;
    } else {
      // Rest day with nothing scheduled — pass through it.
    }
    day = addDays(day, -1);
  }
  return streak;
}

export interface AdherenceSummary {
  streak: number;
  /** 0–1 across the window, or null if nothing was ever due in it. */
  rate: number | null;
  daysActive: number;
  windowDays: number;
  sessionsInWindow: number;
}

export function summarise(
  prescriptions: Prescription[],
  sessions: SessionLog[],
  windowDays = 30,
): AdherenceSummary {
  const days = lastNDays(windowDays);
  const stats = statsForRange(prescriptions, sessions, days);
  const due = stats.reduce((n, s) => n + s.due, 0);
  const done = stats.reduce((n, s) => n + s.done, 0);
  const window = new Set(days);
  return {
    streak: computeStreak(prescriptions, sessions),
    rate: due ? done / due : null,
    daysActive: stats.filter((s) => s.logged > 0).length,
    windowDays,
    sessionsInWindow: sessions.filter((s) => window.has(s.day)).length,
  };
}

/** Deliberately warm. Nothing here should read as a scolding. */
export function encouragement(dueToday: number, doneToday: number) {
  if (dueToday === 0) return 'Nothing scheduled today. A rest day is part of the plan.';
  if (doneToday === 0) return 'Nothing logged yet today. One set still counts.';
  if (doneToday >= dueToday) return 'Everything scheduled today is done. Nice work.';
  return `${doneToday} of ${dueToday} done today. Keep going when you can.`;
}
