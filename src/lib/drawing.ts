/**
 * Canvas overlay: the live skeleton, the finger tracking, the measured angle,
 * and the ghost limb showing where the target sits.
 *
 * Two jobs. The obvious one is feedback while you move. The quieter one is
 * trust: you can see exactly which joints the app thinks it has found, so when
 * a number looks wrong you can tell whether the tracking is off rather than
 * wondering.
 *
 * All input points are normalized 0–1 in the *video's* frame. Mirroring is
 * applied here, at draw time, so the maths upstream never has to care.
 */
import { HAND_EDGES, HAND_NAMES, POSE_EDGES, POSE_NAMES, type Digit, type Segment } from './landmarks';
import type { DetectedHand, Pt } from './metrics';

export const SEGMENT_COLORS: Record<Segment, string> = {
  torso: '#22d3ee',
  'arm-left': '#34d399',
  'arm-right': '#fbbf24',
  'leg-left': '#a78bfa',
  'leg-right': '#fb7185',
  head: '#94a3b8',
};

export const DIGIT_COLORS: Record<Digit, string> = {
  thumb: '#f472b6',
  index: '#fbbf24',
  middle: '#4ade80',
  ring: '#38bdf8',
  pinky: '#c084fc',
  palm: '#e2e8f0',
};

export interface OverlayJoints {
  /** Pose landmark indices forming the measured angle: a — b(vertex) — c. */
  a: number;
  b: number;
  c: number;
  /** Vertex angle in degrees that corresponds to hitting the target. */
  targetVertex?: number;
}

export interface DrawOptions {
  mirrored: boolean;
  /** Draw the numeric index beside each landmark — the debug view. */
  showNumbers: boolean;
  /** Angle to annotate, plus the target ghost. */
  highlight?: OverlayJoints;
  /** Text shown at the vertex, e.g. "94°". */
  readout?: string;
  /** Recolor the highlighted joint when the target is met. */
  onTarget?: boolean;
  /** Dim everything when the model has lost the person. */
  dimmed?: boolean;
}

interface Size {
  width: number;
  height: number;
}

const MIN_DRAW_SCORE = 0.35;

function px(p: Pt, size: Size, mirrored: boolean): { x: number; y: number } {
  return { x: (mirrored ? 1 - p.x : p.x) * size.width, y: p.y * size.height };
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

export function clearCanvas(ctx: CanvasRenderingContext2D, size: Size) {
  ctx.clearRect(0, 0, size.width, size.height);
}

export function drawPose(
  ctx: CanvasRenderingContext2D,
  pose: Pt[],
  size: Size,
  opts: DrawOptions,
) {
  const scale = Math.min(size.width, size.height) / 480;
  const baseAlpha = opts.dimmed ? 0.35 : 1;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [i, j, segment] of POSE_EDGES) {
    const a = pose[i];
    const b = pose[j];
    if (!a || !b) continue;
    const confidence = Math.min(a.score, b.score);
    if (confidence < MIN_DRAW_SCORE) continue;
    const pa = px(a, size, opts.mirrored);
    const pb = px(b, size, opts.mirrored);

    // A dark casing under each bone keeps the skeleton readable over a bright
    // or busy background — without it the overlay disappears against a window.
    ctx.strokeStyle = withAlpha('#0b1220', 0.45 * baseAlpha);
    ctx.lineWidth = 8 * scale;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();

    ctx.strokeStyle = withAlpha(SEGMENT_COLORS[segment], confidence * baseAlpha);
    ctx.lineWidth = 4.5 * scale;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }

  const highlighted = new Set(
    opts.highlight ? [opts.highlight.a, opts.highlight.b, opts.highlight.c] : [],
  );

  pose.forEach((p, index) => {
    if (!p || p.score < MIN_DRAW_SCORE) return;
    const { x, y } = px(p, size, opts.mirrored);
    const isKey = highlighted.has(index);
    const r = (isKey ? 7 : 4) * scale;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = isKey
      ? opts.onTarget
        ? withAlpha('#34d399', baseAlpha)
        : withAlpha('#ffffff', baseAlpha)
      : withAlpha('#e2e8f0', p.score * 0.9 * baseAlpha);
    ctx.fill();
    ctx.lineWidth = 2 * scale;
    ctx.strokeStyle = withAlpha('#0b1220', 0.6 * baseAlpha);
    ctx.stroke();

    if (opts.showNumbers) {
      label(ctx, `${index} ${POSE_NAMES[index] ?? ''}`.trim(), x + r + 3 * scale, y, scale, '#e2e8f0');
    }
  });
}

export function drawHands(
  ctx: CanvasRenderingContext2D,
  hands: DetectedHand[],
  size: Size,
  opts: DrawOptions,
) {
  const scale = Math.min(size.width, size.height) / 480;
  const baseAlpha = opts.dimmed ? 0.4 : 1;

  for (const hand of hands) {
    const pts = hand.points;
    if (!pts?.length) continue;

    for (const [i, j, digit] of HAND_EDGES) {
      const pa = px(pts[i], size, opts.mirrored);
      const pb = px(pts[j], size, opts.mirrored);
      ctx.strokeStyle = withAlpha('#0b1220', 0.5 * baseAlpha);
      ctx.lineWidth = 6 * scale;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();

      ctx.strokeStyle = withAlpha(DIGIT_COLORS[digit], baseAlpha);
      ctx.lineWidth = 3 * scale;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    pts.forEach((p, index) => {
      const { x, y } = px(p, size, opts.mirrored);
      // Fingertips are what people watch, so make them the biggest dots.
      const isTip = index === 4 || index === 8 || index === 12 || index === 16 || index === 20;
      const r = (isTip ? 5.5 : 3) * scale;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha('#ffffff', baseAlpha);
      ctx.fill();
      ctx.lineWidth = 1.5 * scale;
      ctx.strokeStyle = withAlpha('#0b1220', 0.6 * baseAlpha);
      ctx.stroke();

      if (opts.showNumbers) {
        label(ctx, `${index} ${HAND_NAMES[index] ?? ''}`.trim(), x + r + 2 * scale, y, scale * 0.85, '#f8fafc');
      }
    });

    // Which hand is which — the thing people most want confirmed.
    const wrist = px(pts[0], size, opts.mirrored);
    label(
      ctx,
      `${hand.side} hand`,
      wrist.x - 18 * scale,
      wrist.y + 22 * scale,
      scale * 1.1,
      '#f8fafc',
    );
  }
}

/** The measured angle: an arc at the vertex, plus a ghost limb at the target. */
export function drawAngle(
  ctx: CanvasRenderingContext2D,
  pose: Pt[],
  size: Size,
  opts: DrawOptions,
) {
  const h = opts.highlight;
  if (!h) return;
  const A = pose[h.a];
  const B = pose[h.b];
  const C = pose[h.c];
  if (!A || !B || !C) return;
  if (Math.min(A.score, B.score, C.score) < MIN_DRAW_SCORE) return;

  const scale = Math.min(size.width, size.height) / 480;
  const pa = px(A, size, opts.mirrored);
  const pb = px(B, size, opts.mirrored);
  const pc = px(C, size, opts.mirrored);

  const angA = Math.atan2(pa.y - pb.y, pa.x - pb.x);
  const angC = Math.atan2(pc.y - pb.y, pc.x - pb.x);
  const radius = Math.max(28, Math.min(70, Math.hypot(pc.x - pb.x, pc.y - pb.y) * 0.45)) * (scale > 1 ? 1 : 1);

  // Shortest sweep between the two limb directions.
  let delta = angC - angA;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  if (h.targetVertex != null && Number.isFinite(h.targetVertex)) {
    const sign = Math.sign(delta) || 1;
    const targetAngle = angA + sign * (h.targetVertex * Math.PI) / 180;
    const segmentLength = Math.hypot(pc.x - pb.x, pc.y - pb.y);
    const ghost = {
      x: pb.x + Math.cos(targetAngle) * segmentLength,
      y: pb.y + Math.sin(targetAngle) * segmentLength,
    };

    ctx.save();
    ctx.setLineDash([9 * scale, 7 * scale]);
    ctx.strokeStyle = withAlpha('#fbbf24', 0.95);
    ctx.lineWidth = 3.5 * scale;
    ctx.beginPath();
    ctx.moveTo(pb.x, pb.y);
    ctx.lineTo(ghost.x, ghost.y);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, 6 * scale, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha('#fbbf24', 0.35);
    ctx.fill();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    label(ctx, 'target', ghost.x + 9 * scale, ghost.y, scale, '#fbbf24');
  }

  ctx.beginPath();
  ctx.arc(pb.x, pb.y, radius, angA, angA + delta, delta < 0);
  ctx.strokeStyle = opts.onTarget ? '#34d399' : '#f8fafc';
  ctx.lineWidth = 4 * scale;
  ctx.stroke();

  if (opts.readout) {
    const mid = angA + delta / 2;
    const tx = pb.x + Math.cos(mid) * (radius + 26 * scale);
    const ty = pb.y + Math.sin(mid) * (radius + 26 * scale);
    bigLabel(ctx, opts.readout, tx, ty, scale, opts.onTarget ? '#34d399' : '#ffffff');
  }
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: string,
) {
  ctx.font = `600 ${Math.round(11 * scale)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = 'rgba(11, 18, 32, 0.8)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function bigLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: string,
) {
  ctx.font = `700 ${Math.round(26 * scale)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(text).width + 18 * scale;
  const height = 34 * scale;

  ctx.fillStyle = 'rgba(11, 18, 32, 0.72)';
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, 10 * scale);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillText(text, x, y + scale);
  ctx.textAlign = 'start';
}

/** Big centered message for "step back" / "can't see you" states. */
export function drawNotice(ctx: CanvasRenderingContext2D, size: Size, text: string) {
  const scale = Math.min(size.width, size.height) / 480;
  ctx.save();
  ctx.font = `600 ${Math.round(18 * scale)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(text).width + 40 * scale;
  const height = 46 * scale;
  const x = size.width / 2;
  const y = size.height - height;

  ctx.fillStyle = 'rgba(11, 18, 32, 0.8)';
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, 12 * scale);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(text, x, y);
  ctx.restore();
}
