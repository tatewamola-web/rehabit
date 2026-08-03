/**
 * Domain types. Everything here is persisted locally in IndexedDB; nothing
 * leaves the machine. Ids are UUIDs so exports from two devices can be merged
 * by hand without collisions.
 */

export type Side = 'left' | 'right' | 'both';

/** Which side the condition affects. Drives defaults, never hides anything. */
export type AffectedSide = Side | 'unspecified';

export type ExerciseCategory =
  | 'shoulder-elbow'
  | 'hand-wrist'
  | 'hip-knee'
  | 'ankle-foot'
  | 'trunk-neck'
  | 'balance'
  | 'functional';

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  'shoulder-elbow': 'Shoulder & elbow',
  'hand-wrist': 'Hand & wrist',
  'hip-knee': 'Hip & knee',
  'ankle-foot': 'Ankle & foot',
  'trunk-neck': 'Trunk & neck',
  balance: 'Balance',
  functional: 'Everyday tasks',
};

/** What the webcam can measure for an exercise. See lib/metrics.ts. */
export type MetricId =
  | 'elbow-flexion'
  | 'shoulder-flexion'
  | 'shoulder-abduction'
  | 'knee-flexion'
  | 'hip-flexion'
  | 'hip-abduction'
  | 'wrist-deviation'
  | 'trunk-lateral-flexion'
  | 'trunk-forward-flexion'
  | 'ankle-dorsiflexion'
  | 'hand-close'
  | 'hand-open'
  | 'index-mcp-flexion'
  | 'thumb-opposition'
  | 'finger-spread'
  | 'pinch-aperture';

export type MetricUnit = '°' | '%';

export type CameraView = 'front' | 'side' | 'either';

/** How confident the pose model is that it can see the joints we need. */
export type TrackingQuality = 'good' | 'partial' | 'lost';

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  /** One plain-language sentence: what this is and why you'd do it. */
  summary: string;
  steps: string[];
  cues: string[];
  /** Shown in amber next to the exercise. Keep to genuine safety content. */
  safety?: string;
  /** Why this matters specifically after a stroke, when it does. */
  strokeNote?: string;
  /** The angle the Motion Analyst can track, if any. */
  metric?: MetricId;
  /** Angle at which a rep counts as reaching target, in the metric's unit. */
  defaultTarget?: number;
  /** For most metrics a bigger number is the goal; extension work inverts it. */
  targetDirection?: 'increase' | 'decrease';
  cameraView?: CameraView;
  /** Does it make sense to do this one side at a time? */
  bilateral: boolean;
  /** Held positions (balance, stretches) log seconds rather than reps. */
  holdBased?: boolean;
  equipment?: string[];
  tags: string[];
  builtIn: boolean;
  /** Set when the user edits or archives a built-in. */
  archived?: boolean;
  createdAt: number;
}

export interface Prescription {
  id: string;
  exerciseId: string;
  /** Who prescribed it — free text, e.g. "Dana R., OT". Purely for the export. */
  prescribedBy?: string;
  side: Side;
  sets: number;
  reps: number;
  holdSeconds?: number;
  /** How many times a day the whole thing should be done. */
  timesPerDay: number;
  /** 0 = Sunday … 6 = Saturday. */
  daysOfWeek: number[];
  /** Personal ROM goal, overriding the exercise default. */
  targetValue?: number;
  notes?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** One completed bout of one exercise. Manual or webcam-tracked. */
export interface SessionLog {
  id: string;
  prescriptionId?: string;
  exerciseId: string;
  /** Local calendar day, `YYYY-MM-DD`, so day grouping never drifts by zone. */
  day: string;
  startedAt: number;
  durationSeconds?: number;
  side: Side;
  source: 'manual' | 'tracked';
  setsCompleted: number;
  repsCompleted: number;
  holdSecondsTotal?: number;
  /** 0–10, optional. Empty means "didn't say", not zero. */
  pain?: number;
  fatigue?: number;
  notes?: string;

  // --- webcam sessions only ---
  metric?: MetricId;
  targetValue?: number;
  /** Best value achieved this session, in the metric's unit. */
  peakValue?: number;
  /** The other end of the range — how far back toward neutral they returned. */
  minValue?: number;
  /** Peak of each detected rep, in order. */
  repPeaks?: number[];
  /** Downsampled angle trace: [msFromStart, value][]. ~10 Hz, capped. */
  series?: [number, number][];
  reachedTarget?: boolean;
  /** Fraction of frames where the needed joints were confidently visible. */
  trackingScore?: number;
}

/** Generic time series so grip strength / tremor are just more rows. */
export type ExtraMetricKind = 'grip-strength' | 'pinch-strength' | 'tremor' | 'custom';

export interface MetricReading {
  id: string;
  kind: ExtraMetricKind;
  /** Free label for `custom`, otherwise a display override. */
  label?: string;
  value: number;
  unit: string;
  side: Side;
  day: string;
  recordedAt: number;
  notes?: string;
  /** Where the number came from. Device integrations write 'device'. */
  source: 'manual' | 'device';
}

export interface Settings {
  id: 'settings';
  displayName?: string;
  affectedSide: AffectedSide;
  /** The date the stroke or injury happened, `YYYY-MM-DD`. Optional. */
  onsetDate?: string;
  condition?: string;
  theme: 'system' | 'light' | 'dark';
  textScale: number;
  /** Mirror the webcam preview. On by default — it's how people expect to look. */
  mirrorCamera: boolean;
  /** 'lite' is fast and enough for most; 'full' is more accurate, more CPU. */
  poseModel: 'lite' | 'full';
  showLandmarkNumbers: boolean;
  remindersEnabled: boolean;
  /** `HH:MM` local times to nudge, while the app is open. */
  reminderTimes: string[];
  /** Bumped when the user accepts the disclaimer; a version change re-prompts. */
  disclaimerAcceptedVersion?: number;
  disclaimerAcceptedAt?: number;
  ptName?: string;
  gripUnit: 'kg' | 'lb';
}

export interface ExportBundle {
  app: 'rehabit';
  formatVersion: 1;
  exportedAt: string;
  settings: Settings | null;
  exercises: Exercise[];
  prescriptions: Prescription[];
  sessions: SessionLog[];
  readings: MetricReading[];
}
