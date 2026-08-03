/**
 * One provider holding the whole local database in memory.
 *
 * This is a single-user app whose data is a few thousand rows at the very most,
 * so reloading every store on any write is simpler than fine-grained caching and
 * fast enough that it never shows. If someone ever accumulates years of
 * second-by-second traces, the session store is the one to paginate first.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as db from '../lib/db';
import type { Exercise, MetricReading, Prescription, SessionLog, Settings } from '../lib/types';

interface StoreValue {
  ready: boolean;
  settings: Settings;
  /** Exercises available to pick from — archived ones excluded. */
  exercises: Exercise[];
  /** Including archived, so historical logs can still resolve a name. */
  allExercises: Exercise[];
  exerciseById: Map<string, Exercise>;
  prescriptions: Prescription[];
  activePrescriptions: Prescription[];
  sessions: SessionLog[];
  readings: MetricReading[];
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  reload: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(db.DEFAULT_SETTINGS);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [sessions, setSessions] = useState<SessionLog[]>([]);
  const [readings, setReadings] = useState<MetricReading[]>([]);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    const [s, ex, rx, ss, rd] = await Promise.all([
      db.getSettings(),
      db.listExercises(true),
      db.listPrescriptions(),
      db.listSessions(),
      db.listReadings(),
    ]);
    if (!mounted.current) return;
    setSettings(s);
    setExercises(ex);
    setPrescriptions(rx);
    setSessions(ss);
    setReadings(rd);
  }, []);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      await db.seedLibrary();
      await reload();
      if (mounted.current) setReady(true);
    })();
    const unsubscribe = db.subscribe(() => {
      void reload();
    });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [reload]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = await db.saveSettings(patch);
    setSettings(next);
  }, []);

  // Theme + text scale are applied to <html> so they cover portals and print.
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      root.classList.toggle('dark', dark);
      root.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(settings.textScale));
  }, [settings.textScale]);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      settings,
      exercises: exercises.filter((e) => !e.archived),
      allExercises: exercises,
      exerciseById: new Map(exercises.map((e) => [e.id, e])),
      prescriptions,
      activePrescriptions: prescriptions.filter((p) => p.active),
      sessions,
      readings,
      updateSettings,
      reload,
    }),
    [ready, settings, exercises, prescriptions, sessions, readings, updateSettings, reload],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

/** Looks through archived exercises too, so old logs still render a name. */
export function useExerciseName(id: string): string {
  const { exerciseById } = useStore();
  return exerciseById.get(id)?.name ?? 'Removed exercise';
}
