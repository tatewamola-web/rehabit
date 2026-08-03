/**
 * Local storage layer. Everything lives in IndexedDB in this browser profile on
 * this machine — there is no server and nothing is uploaded anywhere.
 *
 * Two consequences worth knowing about, surfaced in Settings:
 *   · clearing site data for localhost wipes the log
 *   · a different browser or profile is a different, empty log
 * The JSON export is the answer to both, and Settings nags gently about it.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { BUILT_IN_EXERCISES } from './exerciseLibrary';
import type {
  Exercise,
  ExportBundle,
  MetricReading,
  Prescription,
  SessionLog,
  Settings,
} from './types';

const DB_NAME = 'rehabit';
const DB_VERSION = 1;

interface RehabitDB extends DBSchema {
  exercises: { key: string; value: Exercise };
  prescriptions: { key: string; value: Prescription; indexes: { byExercise: string } };
  sessions: { key: string; value: SessionLog; indexes: { byDay: string; byExercise: string } };
  readings: { key: string; value: MetricReading; indexes: { byDay: string; byKind: string } };
  settings: { key: string; value: Settings };
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  affectedSide: 'unspecified',
  theme: 'system',
  textScale: 1,
  mirrorCamera: true,
  poseModel: 'lite',
  showLandmarkNumbers: false,
  remindersEnabled: false,
  reminderTimes: ['09:00', '14:00', '19:00'],
  gripUnit: 'kg',
};

/** Bump to re-show the disclaimer after a material change to it. */
export const DISCLAIMER_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RehabitDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<RehabitDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('exercises', { keyPath: 'id' });

        const rx = db.createObjectStore('prescriptions', { keyPath: 'id' });
        rx.createIndex('byExercise', 'exerciseId');

        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('byDay', 'day');
        sessions.createIndex('byExercise', 'exerciseId');

        const readings = db.createObjectStore('readings', { keyPath: 'id' });
        readings.createIndex('byDay', 'day');
        readings.createIndex('byKind', 'kind');

        db.createObjectStore('settings', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

// --- change notification ----------------------------------------------------

type Store = 'exercises' | 'prescriptions' | 'sessions' | 'readings' | 'settings';
const listeners = new Set<(store: Store) => void>();

export function subscribe(fn: (store: Store) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed(store: Store) {
  for (const fn of listeners) fn(store);
}

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// --- seeding ----------------------------------------------------------------

/**
 * Syncs the built-in catalogue into the database on every start.
 *
 * Built-ins are copied in rather than read from the module at render time so
 * that a session logged years ago can still resolve the exercise it referred
 * to. The consequence is that a copy goes stale the moment the catalogue is
 * corrected — a fixed typo or a clarified cue would never reach anyone who had
 * already opened the app — so their content is refreshed here every time.
 *
 * Only the catalogue's own fields are overwritten. `archived` is the user's
 * decision and survives, and custom exercises are never touched.
 */
export async function seedLibrary(): Promise<void> {
  const db = await getDB();
  const stored = await db.getAll('exercises');
  const byId = new Map(stored.map((e) => [e.id, e]));

  const stale = BUILT_IN_EXERCISES.filter((seed) => {
    const current = byId.get(seed.id);
    if (!current) return true;
    if (!current.builtIn) return false;
    // Compare content only — createdAt and archived are local state.
    const { createdAt: _a, archived: _b, ...currentContent } = current;
    const { createdAt: _c, ...seedContent } = seed;
    return JSON.stringify(currentContent) !== JSON.stringify(seedContent);
  });
  if (!stale.length) return;

  const tx = db.transaction('exercises', 'readwrite');
  const now = Date.now();
  await Promise.all(
    stale.map((seed) => {
      const current = byId.get(seed.id);
      return tx.store.put({
        ...seed,
        createdAt: current?.createdAt ?? now,
        ...(current?.archived ? { archived: true } : {}),
      });
    }),
  );
  await tx.done;
  changed('exercises');
}

// --- settings ---------------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const stored = await db.get('settings', 'settings');
  return { ...DEFAULT_SETTINGS, ...stored, id: 'settings' };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const db = await getDB();
  const next = { ...(await getSettings()), ...patch, id: 'settings' as const };
  await db.put('settings', next);
  changed('settings');
  return next;
}

// --- exercises --------------------------------------------------------------

export async function listExercises(includeArchived = false): Promise<Exercise[]> {
  const db = await getDB();
  const all = await db.getAll('exercises');
  return all
    .filter((e) => includeArchived || !e.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  return (await getDB()).get('exercises', id);
}

export async function putExercise(exercise: Exercise): Promise<void> {
  await (await getDB()).put('exercises', exercise);
  changed('exercises');
}

export async function createExercise(
  input: Omit<Exercise, 'id' | 'builtIn' | 'createdAt'>,
): Promise<Exercise> {
  const exercise: Exercise = { ...input, id: uid(), builtIn: false, createdAt: Date.now() };
  await putExercise(exercise);
  return exercise;
}

/** Built-ins are archived rather than deleted so old logs keep their name. */
export async function removeExercise(id: string): Promise<void> {
  const db = await getDB();
  const exercise = await db.get('exercises', id);
  if (!exercise) return;
  const used = await db.getAllFromIndex('sessions', 'byExercise', id);
  if (exercise.builtIn || used.length) {
    await db.put('exercises', { ...exercise, archived: true });
  } else {
    await db.delete('exercises', id);
  }
  changed('exercises');
}

// --- prescriptions ----------------------------------------------------------

export async function listPrescriptions(): Promise<Prescription[]> {
  const all = await (await getDB()).getAll('prescriptions');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function putPrescription(rx: Prescription): Promise<void> {
  await (await getDB()).put('prescriptions', { ...rx, updatedAt: Date.now() });
  changed('prescriptions');
}

export async function createPrescription(
  input: Omit<Prescription, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Prescription> {
  const now = Date.now();
  const rx: Prescription = { ...input, id: uid(), createdAt: now, updatedAt: now };
  await (await getDB()).put('prescriptions', rx);
  changed('prescriptions');
  return rx;
}

export async function deletePrescription(id: string): Promise<void> {
  await (await getDB()).delete('prescriptions', id);
  changed('prescriptions');
}

// --- sessions ---------------------------------------------------------------

export async function listSessions(): Promise<SessionLog[]> {
  const all = await (await getDB()).getAll('sessions');
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export async function sessionsOnDay(day: string): Promise<SessionLog[]> {
  return (await getDB()).getAllFromIndex('sessions', 'byDay', day);
}

export async function saveSession(session: SessionLog): Promise<void> {
  await (await getDB()).put('sessions', session);
  changed('sessions');
}

export async function deleteSession(id: string): Promise<void> {
  await (await getDB()).delete('sessions', id);
  changed('sessions');
}

// --- extra metrics ----------------------------------------------------------

export async function listReadings(): Promise<MetricReading[]> {
  const all = await (await getDB()).getAll('readings');
  return all.sort((a, b) => b.recordedAt - a.recordedAt);
}

export async function saveReading(reading: MetricReading): Promise<void> {
  await (await getDB()).put('readings', reading);
  changed('readings');
}

export async function deleteReading(id: string): Promise<void> {
  await (await getDB()).delete('readings', id);
  changed('readings');
}

// --- export / import --------------------------------------------------------

export async function exportAll(): Promise<ExportBundle> {
  const db = await getDB();
  const [settings, exercises, prescriptions, sessions, readings] = await Promise.all([
    db.get('settings', 'settings'),
    db.getAll('exercises'),
    db.getAll('prescriptions'),
    db.getAll('sessions'),
    db.getAll('readings'),
  ]);
  return {
    app: 'rehabit',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    settings: settings ?? null,
    exercises,
    prescriptions,
    sessions,
    readings,
  };
}

export interface ImportResult {
  exercises: number;
  prescriptions: number;
  sessions: number;
  readings: number;
  settingsRestored: boolean;
}

/**
 * Merges a bundle in by id. Existing rows with the same id are overwritten, so
 * re-importing your own export is a no-op rather than a duplicate.
 */
export async function importBundle(
  bundle: ExportBundle,
  opts: { restoreSettings: boolean } = { restoreSettings: false },
): Promise<ImportResult> {
  if (bundle?.app !== 'rehabit') {
    throw new Error('That file is not a Rehabit export.');
  }
  if (bundle.formatVersion !== 1) {
    throw new Error(`Unsupported export format (v${bundle.formatVersion}).`);
  }
  const db = await getDB();
  const tx = db.transaction(
    ['exercises', 'prescriptions', 'sessions', 'readings', 'settings'],
    'readwrite',
  );
  await Promise.all([
    ...(bundle.exercises ?? []).map((e) => tx.objectStore('exercises').put(e)),
    ...(bundle.prescriptions ?? []).map((p) => tx.objectStore('prescriptions').put(p)),
    ...(bundle.sessions ?? []).map((s) => tx.objectStore('sessions').put(s)),
    ...(bundle.readings ?? []).map((r) => tx.objectStore('readings').put(r)),
    opts.restoreSettings && bundle.settings
      ? tx.objectStore('settings').put({ ...bundle.settings, id: 'settings' as const })
      : Promise.resolve(),
  ]);
  await tx.done;
  for (const store of ['exercises', 'prescriptions', 'sessions', 'readings', 'settings'] as const) {
    changed(store);
  }
  return {
    exercises: bundle.exercises?.length ?? 0,
    prescriptions: bundle.prescriptions?.length ?? 0,
    sessions: bundle.sessions?.length ?? 0,
    readings: bundle.readings?.length ?? 0,
    settingsRestored: opts.restoreSettings && !!bundle.settings,
  };
}

/** Wipes every store. Only reachable from Settings behind a typed confirmation. */
export async function eraseEverything(): Promise<void> {
  const db = await getDB();
  const stores = ['exercises', 'prescriptions', 'sessions', 'readings', 'settings'] as const;
  const tx = db.transaction(stores, 'readwrite');
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
  for (const s of stores) changed(s);
  await seedLibrary();
}

/** Rough on-disk footprint, shown in Settings so storage never feels opaque. */
export async function estimateUsage(): Promise<{ usedBytes: number; quotaBytes: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usedBytes: usage, quotaBytes: quota };
}
