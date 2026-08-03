/**
 * Joint-angle definitions and the geometry behind them.
 *
 * ACCURACY, HONESTLY: these are angles measured on a flat picture of a person.
 * We correct for the video's aspect ratio and gate on the model's own
 * confidence, but a movement that swings toward or away from the lens will
 * still read short, and the number is not a goniometer reading. Every metric
 * therefore carries a `cameraView` telling the user where to stand, and a
 * `note` saying what will throw it off. The value of these numbers is in
 * comparing *you today* to *you last week* with the camera in the same place.
 */
import type { CameraView, MetricId, MetricUnit, Side } from './types';
import { HAND, poseSide } from './landmarks';

export interface Pt {
  /** Aspect-corrected normalized x (so 1 unit of x == 1 unit of y). */
  x: number;
  y: number;
  /** Model confidence this landmark is really there, 0–1. */
  score: number;
}

export interface DetectedHand {
  side: 'left' | 'right';
  points: Pt[];
  confidence: number;
}

export interface Frame {
  pose: Pt[] | null;
  hands: DetectedHand[];
}

// --- geometry ---------------------------------------------------------------

/** Interior angle at `b`, in degrees, 0–180. */
export function angleAt(a: Pt, b: Pt, c: Pt): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magA = Math.hypot(abx, aby);
  const magC = Math.hypot(cbx, cby);
  if (magA < 1e-6 || magC < 1e-6) return NaN;
  const cos = Math.min(1, Math.max(-1, dot / (magA * magC)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Angle of the vector a→b away from straight up, 0–180. */
export function angleFromVertical(a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const mag = Math.hypot(dx, dy);
  if (mag < 1e-6) return NaN;
  // Screen y grows downward, so "up" is (0, -1).
  const cos = Math.min(1, Math.max(-1, -dy / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, score: Math.min(a.score, b.score) };
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// --- metric definitions -----------------------------------------------------

export interface MetricDef {
  id: MetricId;
  label: string;
  /** Compact label for chips and chart axes. */
  short: string;
  unit: MetricUnit;
  source: 'pose' | 'hand';
  /** Plot bounds and the ceiling used for progress rings. */
  range: [number, number];
  /** A reasonable functional goal when nothing else is prescribed. */
  suggestedTarget: number;
  cameraView: CameraView;
  /** What throws this measurement off. Shown in the UI, not buried. */
  note: string;
  /** Pose landmark indices that must be visible for the value to be trusted. */
  required: (side: 'left' | 'right') => number[];
  compute: (frame: Frame, side: 'left' | 'right') => number | null;
}

/** Average flexion of one finger, 0° straight to ~100° fully curled. */
function fingerFlexion(h: Pt[], mcp: number, pip: number, dip: number): number {
  const mcpAngle = angleAt(h[HAND.wrist], h[mcp], h[pip]);
  const pipAngle = angleAt(h[mcp], h[pip], h[dip]);
  return (180 - mcpAngle + (180 - pipAngle)) / 2;
}

function handCurlPercent(h: Pt[]): number {
  const fingers = [
    fingerFlexion(h, HAND.indexMcp, HAND.indexPip, HAND.indexDip),
    fingerFlexion(h, HAND.middleMcp, HAND.middlePip, HAND.middleDip),
    fingerFlexion(h, HAND.ringMcp, HAND.ringPip, HAND.ringDip),
    fingerFlexion(h, HAND.pinkyMcp, HAND.pinkyPip, HAND.pinkyDip),
  ].filter((v) => Number.isFinite(v));
  if (!fingers.length) return NaN;
  const mean = fingers.reduce((a, b) => a + b, 0) / fingers.length;
  // ~95° average flexion is a closed fist for most hands.
  return clamp((mean / 95) * 100, 0, 100);
}

/** Palm width, used to normalize distances so hand size and depth cancel out. */
function handScale(h: Pt[]): number {
  return Math.max(distance(h[HAND.wrist], h[HAND.middleMcp]), 1e-4);
}

function pickHand(frame: Frame, side: 'left' | 'right'): Pt[] | null {
  const hand = frame.hands.find((h) => h.side === side);
  return hand ? hand.points : null;
}

function poseOk(pose: Pt[] | null, idx: number[]): Pt[] | null {
  if (!pose) return null;
  for (const i of idx) {
    const p = pose[i];
    if (!p || p.score < MIN_VISIBILITY) return null;
  }
  return pose;
}

/** Below this the model is guessing at an occluded joint; don't log the value. */
export const MIN_VISIBILITY = 0.55;

const defs: MetricDef[] = [
  {
    id: 'elbow-flexion',
    label: 'Elbow flexion',
    short: 'Elbow',
    unit: '°',
    source: 'pose',
    range: [0, 150],
    suggestedTarget: 120,
    cameraView: 'side',
    note: 'Keep your whole arm in frame. Reads low if the arm points at the camera.',
    required: (s) => [poseSide(s).shoulder, poseSide(s).elbow, poseSide(s).wrist],
    compute: (f, s) => {
      const j = poseSide(s);
      const p = poseOk(f.pose, [j.shoulder, j.elbow, j.wrist]);
      if (!p) return null;
      const v = angleAt(p[j.shoulder], p[j.elbow], p[j.wrist]);
      return Number.isFinite(v) ? 180 - v : null;
    },
  },
  {
    id: 'shoulder-flexion',
    label: 'Shoulder flexion (arm forward and up)',
    short: 'Shoulder flex.',
    unit: '°',
    source: 'pose',
    range: [0, 180],
    suggestedTarget: 120,
    cameraView: 'side',
    note: 'Stand side-on to the camera. From the front this reads as abduction instead.',
    required: (s) => [poseSide(s).hip, poseSide(s).shoulder, poseSide(s).elbow],
    compute: (f, s) => {
      const j = poseSide(s);
      const p = poseOk(f.pose, [j.hip, j.shoulder, j.elbow]);
      if (!p) return null;
      const v = angleAt(p[j.hip], p[j.shoulder], p[j.elbow]);
      return Number.isFinite(v) ? v : null;
    },
  },
  {
    id: 'shoulder-abduction',
    label: 'Shoulder abduction (arm out to the side)',
    short: 'Shoulder abd.',
    unit: '°',
    source: 'pose',
    range: [0, 180],
    suggestedTarget: 110,
    cameraView: 'front',
    note: 'Face the camera square-on. Leaning sideways inflates this number.',
    required: (s) => [poseSide(s).hip, poseSide(s).shoulder, poseSide(s).elbow],
    compute: (f, s) => {
      const j = poseSide(s);
      const p = poseOk(f.pose, [j.hip, j.shoulder, j.elbow]);
      if (!p) return null;
      const v = angleAt(p[j.hip], p[j.shoulder], p[j.elbow]);
      return Number.isFinite(v) ? v : null;
    },
  },
  {
    id: 'knee-flexion',
    label: 'Knee flexion',
    short: 'Knee',
    unit: '°',
    source: 'pose',
    range: [0, 150],
    suggestedTarget: 100,
    cameraView: 'side',
    note: 'Side-on view. Loose trousers can pull the knee point off by a few degrees.',
    required: (s) => [poseSide(s).hip, poseSide(s).knee, poseSide(s).ankle],
    compute: (f, s) => {
      const j = poseSide(s);
      const p = poseOk(f.pose, [j.hip, j.knee, j.ankle]);
      if (!p) return null;
      const v = angleAt(p[j.hip], p[j.knee], p[j.ankle]);
      return Number.isFinite(v) ? 180 - v : null;
    },
  },
  {
    id: 'hip-flexion',
    label: 'Hip flexion',
    short: 'Hip flex.',
    unit: '°',
    source: 'pose',
    range: [0, 130],
    suggestedTarget: 90,
    cameraView: 'side',
    note: 'Side-on view. Trunk lean is counted as hip movement, so stay upright.',
    required: (s) => [poseSide(s).shoulder, poseSide(s).hip, poseSide(s).knee],
    compute: (f, s) => {
      const j = poseSide(s);
      const p = poseOk(f.pose, [j.shoulder, j.hip, j.knee]);
      if (!p) return null;
      const v = angleAt(p[j.shoulder], p[j.hip], p[j.knee]);
      return Number.isFinite(v) ? 180 - v : null;
    },
  },
  {
    id: 'hip-abduction',
    label: 'Hip abduction (leg out to the side)',
    short: 'Hip abd.',
    unit: '°',
    source: 'pose',
    range: [0, 60],
    suggestedTarget: 30,
    cameraView: 'front',
    note: 'Face the camera. Measured as thigh angle away from straight down.',
    required: (s) => [poseSide(s).hip, poseSide(s).knee],
    compute: (f, s) => {
      const j = poseSide(s);
      const p = poseOk(f.pose, [j.hip, j.knee]);
      if (!p) return null;
      // Thigh direction vs. straight down.
      const v = 180 - angleFromVertical(p[j.hip], p[j.knee]);
      return Number.isFinite(v) ? Math.abs(v) : null;
    },
  },
  {
    id: 'wrist-deviation',
    label: 'Wrist bend from neutral',
    short: 'Wrist',
    unit: '°',
    source: 'pose',
    range: [0, 90],
    suggestedTarget: 45,
    cameraView: 'side',
    note: 'Coarse — it does not tell flexion from extension. The hand view is better if your hand fits in frame.',
    required: (s) => [poseSide(s).elbow, poseSide(s).wrist, poseSide(s).index],
    compute: (f, s) => {
      const j = poseSide(s);
      const p = poseOk(f.pose, [j.elbow, j.wrist, j.index]);
      if (!p) return null;
      const v = angleAt(p[j.elbow], p[j.wrist], p[j.index]);
      return Number.isFinite(v) ? Math.abs(180 - v) : null;
    },
  },
  {
    id: 'trunk-lateral-flexion',
    label: 'Trunk side bend',
    short: 'Side bend',
    unit: '°',
    source: 'pose',
    range: [0, 50],
    suggestedTarget: 25,
    cameraView: 'front',
    note: 'Face the camera. Sit or stand square; twisting reads as bending.',
    required: () => [11, 12, 23, 24],
    compute: (f) => {
      const p = poseOk(f.pose, [11, 12, 23, 24]);
      if (!p) return null;
      const shoulders = midpoint(p[11], p[12]);
      const hips = midpoint(p[23], p[24]);
      const v = angleFromVertical(hips, shoulders);
      return Number.isFinite(v) ? v : null;
    },
  },
  {
    id: 'trunk-forward-flexion',
    label: 'Trunk forward lean',
    short: 'Forward lean',
    unit: '°',
    source: 'pose',
    range: [0, 90],
    suggestedTarget: 40,
    cameraView: 'side',
    note: 'Side-on view. Same measurement as the side bend, read from a different angle.',
    required: () => [11, 12, 23, 24],
    compute: (f) => {
      const p = poseOk(f.pose, [11, 12, 23, 24]);
      if (!p) return null;
      const shoulders = midpoint(p[11], p[12]);
      const hips = midpoint(p[23], p[24]);
      const v = angleFromVertical(hips, shoulders);
      return Number.isFinite(v) ? v : null;
    },
  },
  {
    id: 'ankle-dorsiflexion',
    label: 'Ankle dorsiflexion (toes toward you)',
    short: 'Ankle',
    unit: '°',
    source: 'pose',
    range: [-40, 40],
    suggestedTarget: 10,
    cameraView: 'side',
    note: 'The least reliable measurement here — feet are small and often cut off or blurred. Treat it as a rough guide.',
    required: (s) => [poseSide(s).knee, poseSide(s).ankle, poseSide(s).foot],
    compute: (f, s) => {
      const j = poseSide(s);
      const p = poseOk(f.pose, [j.knee, j.ankle, j.foot]);
      if (!p) return null;
      const v = angleAt(p[j.knee], p[j.ankle], p[j.foot]);
      return Number.isFinite(v) ? 90 - v : null;
    },
  },
  {
    id: 'hand-close',
    label: 'Making a fist',
    short: 'Fist close',
    unit: '%',
    source: 'hand',
    range: [0, 100],
    suggestedTarget: 80,
    cameraView: 'either',
    note: 'Hold your hand palm-side or back-side to the camera, about an arm away. 100% is a full fist.',
    required: () => [],
    compute: (f, s) => {
      const h = pickHand(f, s);
      if (!h) return null;
      const v = handCurlPercent(h);
      return Number.isFinite(v) ? v : null;
    },
  },
  {
    id: 'hand-open',
    label: 'Opening the hand',
    short: 'Hand open',
    unit: '%',
    source: 'hand',
    range: [0, 100],
    suggestedTarget: 85,
    cameraView: 'either',
    note: 'The mirror of fist close. 100% is fingers fully straightened.',
    required: () => [],
    compute: (f, s) => {
      const h = pickHand(f, s);
      if (!h) return null;
      const v = handCurlPercent(h);
      return Number.isFinite(v) ? 100 - v : null;
    },
  },
  {
    id: 'index-mcp-flexion',
    label: 'Index knuckle bend',
    short: 'Index MCP',
    unit: '°',
    source: 'hand',
    range: [0, 100],
    suggestedTarget: 70,
    cameraView: 'either',
    note: 'Keep the back of the hand toward the camera so the knuckle is visible.',
    required: () => [],
    compute: (f, s) => {
      const h = pickHand(f, s);
      if (!h) return null;
      const v = angleAt(h[HAND.wrist], h[HAND.indexMcp], h[HAND.indexPip]);
      return Number.isFinite(v) ? 180 - v : null;
    },
  },
  {
    id: 'thumb-opposition',
    label: 'Thumb opposition',
    short: 'Opposition',
    unit: '%',
    source: 'hand',
    range: [0, 100],
    suggestedTarget: 75,
    cameraView: 'either',
    note: 'How far the thumb travels across the palm toward the little finger. 100% is thumb tip touching the base of the little finger.',
    required: () => [],
    compute: (f, s) => {
      const h = pickHand(f, s);
      if (!h) return null;
      const ratio = distance(h[HAND.thumbTip], h[HAND.pinkyMcp]) / handScale(h);
      if (!Number.isFinite(ratio)) return null;
      // ~2.0 palm-widths apart with the hand open, ~0.35 at full opposition.
      return clamp(((2.0 - ratio) / (2.0 - 0.35)) * 100, 0, 100);
    },
  },
  {
    id: 'finger-spread',
    label: 'Finger spread',
    short: 'Spread',
    unit: '°',
    source: 'hand',
    range: [0, 70],
    suggestedTarget: 40,
    cameraView: 'either',
    note: 'Angle between the index and little fingers with the hand flat to the camera.',
    required: () => [],
    compute: (f, s) => {
      const h = pickHand(f, s);
      if (!h) return null;
      const index = { ...h[HAND.indexTip] };
      const pinky = { ...h[HAND.pinkyTip] };
      const v = angleAt(index, h[HAND.wrist], pinky);
      return Number.isFinite(v) ? v : null;
    },
  },
  {
    id: 'pinch-aperture',
    label: 'Pinch opening',
    short: 'Pinch',
    unit: '%',
    source: 'hand',
    range: [0, 120],
    suggestedTarget: 15,
    cameraView: 'either',
    note: 'Gap between thumb and index tip, as a percentage of palm width. Smaller means a tighter pinch.',
    required: () => [],
    compute: (f, s) => {
      const h = pickHand(f, s);
      if (!h) return null;
      const v = (distance(h[HAND.thumbTip], h[HAND.indexTip]) / handScale(h)) * 100;
      return Number.isFinite(v) ? v : null;
    },
  },
];

export const METRICS: Record<MetricId, MetricDef> = Object.fromEntries(
  defs.map((d) => [d.id, d]),
) as Record<MetricId, MetricDef>;

export const METRIC_LIST = defs;

export function metricOf(id: MetricId | undefined): MetricDef | null {
  return id ? (METRICS[id] ?? null) : null;
}

/** Resolves a prescription's side into the single side we measure this run. */
export function resolveSide(side: Side, fallback: 'left' | 'right' = 'right'): 'left' | 'right' {
  return side === 'both' ? fallback : side;
}

/**
 * Which three pose landmarks to draw the angle arc between, and how to convert
 * a target in the metric's own unit back into the raw vertex angle so the ghost
 * limb lands in the right place. Metrics measured against vertical (trunk lean,
 * hip abduction) and all hand metrics have no three-point arc — the overlay
 * just shows the skeleton for those.
 */
export function overlayJointsFor(
  id: MetricId,
  side: 'left' | 'right',
): { a: number; b: number; c: number; toVertex: (value: number) => number } | null {
  const j = poseSide(side);
  switch (id) {
    case 'elbow-flexion':
      return { a: j.shoulder, b: j.elbow, c: j.wrist, toVertex: (v) => 180 - v };
    case 'shoulder-flexion':
    case 'shoulder-abduction':
      return { a: j.hip, b: j.shoulder, c: j.elbow, toVertex: (v) => v };
    case 'knee-flexion':
      return { a: j.hip, b: j.knee, c: j.ankle, toVertex: (v) => 180 - v };
    case 'hip-flexion':
      return { a: j.shoulder, b: j.hip, c: j.knee, toVertex: (v) => 180 - v };
    case 'wrist-deviation':
      return { a: j.elbow, b: j.wrist, c: j.index, toVertex: (v) => 180 - v };
    case 'ankle-dorsiflexion':
      return { a: j.knee, b: j.ankle, c: j.foot, toVertex: (v) => 90 - v };
    default:
      return null;
  }
}

/** How well can the model currently see what this metric needs? */
export function trackingQualityFor(def: MetricDef, frame: Frame, side: 'left' | 'right') {
  if (def.source === 'hand') {
    const hand = frame.hands.find((h) => h.side === side);
    if (!hand) return { quality: 'lost' as const, hint: `Hold your ${side} hand up to the camera.` };
    return { quality: 'good' as const, hint: '' };
  }
  const needed = def.required(side);
  if (!frame.pose) return { quality: 'lost' as const, hint: 'Step back so your whole body is in frame.' };
  const scores = needed.map((i) => frame.pose?.[i]?.score ?? 0);
  const worst = Math.min(...scores, 1);
  if (worst >= MIN_VISIBILITY) return { quality: 'good' as const, hint: '' };
  if (worst >= 0.3)
    return {
      quality: 'partial' as const,
      hint: 'Some joints are hard to see — try more light or a plainer background.',
    };
  return { quality: 'lost' as const, hint: 'Move so the whole limb is inside the frame.' };
}

export function formatValue(value: number | null | undefined, unit: MetricUnit): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value)}${unit === '°' ? '°' : '%'}`;
}
