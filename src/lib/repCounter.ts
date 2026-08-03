/**
 * Rep detection.
 *
 * The naive approach — "count a rep when the angle crosses the target" — fails
 * exactly the people this app is for: someone whose shoulder gets to 40° when
 * the goal is 110° would get a session of zero reps and no feedback at all. So
 * reps are detected from *your own* movement amplitude, adapting to whatever
 * range you actually have today, and whether you reached the prescribed target
 * is reported separately. You always get a rep count; you also get an honest
 * answer about the target.
 *
 * Guards against the two things that produce fake reps: tremor (handled by a
 * minimum amplitude and a minimum rep duration) and a hand drifting in and out
 * of frame (handled by dropping frames the model isn't confident about, which
 * happens upstream in metrics.ts).
 */

export interface RepEvent {
  index: number;
  /** Best value reached during the rep, in the metric's unit. */
  peak: number;
  startedAt: number;
  endedAt: number;
  reachedTarget: boolean;
}

export interface RepCounterOptions {
  direction: 'increase' | 'decrease';
  /** Prescribed goal, used only for the pass/fail flag. */
  target?: number;
  /** Movement smaller than this is treated as noise, in the metric's unit. */
  minAmplitude?: number;
  /** Reps faster than this are almost always tremor or tracking glitches. */
  minRepMs?: number;
  /** How fast the adaptive high/low marks decay back toward the current value. */
  decayPerSecond?: number;
}

type Phase = 'rest' | 'active';

export class RepCounter {
  private readonly direction: 'increase' | 'decrease';
  private readonly target?: number;
  private readonly minAmplitude: number;
  private readonly minRepMs: number;
  private readonly decay: number;

  private lo = Number.POSITIVE_INFINITY;
  private hi = Number.NEGATIVE_INFINITY;
  private phase: Phase = 'rest';
  private repStart = 0;
  private repPeak = 0;
  private lastTime: number | null = null;

  reps: RepEvent[] = [];

  constructor(opts: RepCounterOptions) {
    this.direction = opts.direction;
    this.target = opts.target;
    this.minAmplitude = opts.minAmplitude ?? 12;
    this.minRepMs = opts.minRepMs ?? 600;
    this.decay = opts.decayPerSecond ?? 3;
  }

  /** True once enough movement has been seen to trust the thresholds. */
  get calibrated(): boolean {
    return Number.isFinite(this.lo) && Number.isFinite(this.hi) && this.amplitude >= this.minAmplitude;
  }

  get amplitude(): number {
    if (!Number.isFinite(this.lo) || !Number.isFinite(this.hi)) return 0;
    return this.hi - this.lo;
  }

  /** 0–1 through the current rep, for the progress ring. */
  progress(value: number): number {
    if (!this.calibrated) return 0;
    const t = (value - this.lo) / Math.max(this.amplitude, 1e-6);
    return Math.min(1, Math.max(0, this.direction === 'increase' ? t : 1 - t));
  }

  get count(): number {
    return this.reps.length;
  }

  private better(a: number, b: number): number {
    return this.direction === 'increase' ? Math.max(a, b) : Math.min(a, b);
  }

  private hitsTarget(value: number): boolean {
    if (this.target == null) return false;
    return this.direction === 'increase' ? value >= this.target : value <= this.target;
  }

  /**
   * Feed one sample. Returns a RepEvent on the frame a rep completes.
   * `value` should already be smoothed; pass `null` for untrusted frames.
   */
  push(value: number | null, timestampMs: number): RepEvent | null {
    if (value == null || !Number.isFinite(value)) {
      this.lastTime = timestampMs;
      return null;
    }
    const dt = this.lastTime === null ? 0 : Math.max(0, (timestampMs - this.lastTime) / 1000);
    this.lastTime = timestampMs;

    // Adaptive extremes: expand instantly, contract slowly, so a single
    // outlier frame can't permanently widen the range.
    const shrink = this.decay * dt;
    this.hi = Number.isFinite(this.hi) ? Math.max(value, this.hi - shrink) : value;
    this.lo = Number.isFinite(this.lo) ? Math.min(value, this.lo + shrink) : value;

    if (!this.calibrated) return null;

    // 70% of the way out is "in the rep", 35% back is "returned".
    const enter = this.direction === 'increase' ? this.lo + 0.7 * this.amplitude : this.hi - 0.7 * this.amplitude;
    const exit = this.direction === 'increase' ? this.lo + 0.35 * this.amplitude : this.hi - 0.35 * this.amplitude;
    const past = (v: number, threshold: number) =>
      this.direction === 'increase' ? v >= threshold : v <= threshold;

    if (this.phase === 'rest') {
      if (past(value, enter)) {
        this.phase = 'active';
        this.repStart = timestampMs;
        this.repPeak = value;
      }
      return null;
    }

    this.repPeak = this.better(this.repPeak, value);

    if (!past(value, exit)) {
      this.phase = 'rest';
      const duration = timestampMs - this.repStart;
      if (duration < this.minRepMs) return null;
      const event: RepEvent = {
        index: this.reps.length + 1,
        peak: this.repPeak,
        startedAt: this.repStart,
        endedAt: timestampMs,
        reachedTarget: this.hitsTarget(this.repPeak),
      };
      this.reps.push(event);
      return event;
    }
    return null;
  }

  reset() {
    this.lo = Number.POSITIVE_INFINITY;
    this.hi = Number.NEGATIVE_INFINITY;
    this.phase = 'rest';
    this.lastTime = null;
    this.reps = [];
  }
}

/**
 * Accumulates time spent at or past the target, for held positions like
 * balance work and stretches where reps are meaningless.
 */
export class HoldTimer {
  private lastTime: number | null = null;
  private holding = false;
  totalSeconds = 0;
  currentSeconds = 0;
  bestSeconds = 0;

  constructor(
    private target: number,
    private direction: 'increase' | 'decrease' = 'increase',
  ) {}

  push(value: number | null, timestampMs: number): void {
    const dt = this.lastTime === null ? 0 : (timestampMs - this.lastTime) / 1000;
    this.lastTime = timestampMs;
    const inPosition =
      value != null &&
      Number.isFinite(value) &&
      (this.direction === 'increase' ? value >= this.target : value <= this.target);

    if (inPosition) {
      this.holding = true;
      this.currentSeconds += dt;
      this.totalSeconds += dt;
      this.bestSeconds = Math.max(this.bestSeconds, this.currentSeconds);
    } else if (this.holding) {
      this.holding = false;
      this.currentSeconds = 0;
    }
  }

  reset() {
    this.lastTime = null;
    this.holding = false;
    this.totalSeconds = 0;
    this.currentSeconds = 0;
    this.bestSeconds = 0;
  }
}
