/**
 * Time-of-day nudges, honestly limited.
 *
 * With no server and no service worker there is no way to reach someone whose
 * browser is closed, so this only fires while the app is open. The Settings
 * copy says exactly that rather than implying an alarm clock. A reminder is
 * skipped if something was logged in the last hour — nobody needs to be told to
 * exercise thirty seconds after they did.
 */
import { useEffect, useRef } from 'react';
import { today } from '../lib/dates';
import type { SessionLog, Settings } from '../lib/types';

const CHECK_INTERVAL_MS = 30_000;

export function useReminders(settings: Settings, sessions: SessionLog[]) {
  const firedRef = useRef<Set<string>>(new Set());
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    if (!settings.remindersEnabled) return;
    if (!('Notification' in window)) return;

    const tick = () => {
      if (Notification.permission !== 'granted') return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const slot = settings.reminderTimes.find((t) => normalize(t) === hhmm);
      if (!slot) return;

      const key = `${today()}@${slot}`;
      if (firedRef.current.has(key)) return;
      firedRef.current.add(key);

      const hourAgo = Date.now() - 3_600_000;
      const recent = sessionsRef.current.some((s) => s.startedAt > hourAgo);
      if (recent) return;

      new Notification('Time for your exercises', {
        body: 'Whenever suits — one set still counts.',
        tag: 'rehabit-reminder',
      });
    };

    const id = window.setInterval(tick, CHECK_INTERVAL_MS);
    tick();
    return () => window.clearInterval(id);
  }, [settings.remindersEnabled, settings.reminderTimes]);
}

function normalize(time: string): string {
  const [h, m] = time.split(':');
  return `${String(Number(h)).padStart(2, '0')}:${(m ?? '00').padStart(2, '0')}`;
}
