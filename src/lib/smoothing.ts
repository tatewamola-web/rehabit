/**
 * One Euro filter.
 *
 * A plain moving average would either leave the angle readout jittering or lag
 * behind the movement — and lag is worse than jitter here, because the number
 * is meant to be feedback you move to. One Euro adapts: heavy smoothing while
 * you hold a position, light smoothing while you move, so the reading is calm
 * at the end of range without dragging on the way there.
 *
 * Casiez, Roussel & Vogel (2012), "1€ Filter".
 */

class LowPass {
  private y: number | null = null;
  private s: number | null = null;

  filter(value: number, alpha: number): number {
    this.s = this.s === null ? value : alpha * value + (1 - alpha) * this.s;
    this.y = value;
    return this.s;
  }

  get last(): number | null {
    return this.y;
  }

  reset() {
    this.y = null;
    this.s = null;
  }
}

export interface OneEuroOptions {
  /** Lower = smoother but laggier at rest. Degrees-per-second scale. */
  minCutoff?: number;
  /** How aggressively to loosen up as speed increases. */
  beta?: number;
  derivativeCutoff?: number;
}

export class OneEuroFilter {
  private xFilter = new LowPass();
  private dxFilter = new LowPass();
  private lastTime: number | null = null;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  constructor({ minCutoff = 1.2, beta = 0.06, derivativeCutoff = 1 }: OneEuroOptions = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = derivativeCutoff;
  }

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** `timestampMs` must increase. Returns the smoothed value. */
  filter(value: number, timestampMs: number): number {
    if (!Number.isFinite(value)) return value;
    const dt =
      this.lastTime === null ? 1 / 30 : Math.max(1e-3, (timestampMs - this.lastTime) / 1000);
    this.lastTime = timestampMs;

    const prev = this.xFilter.last;
    const dx = prev === null ? 0 : (value - prev) / dt;
    const edx = this.dxFilter.filter(dx, OneEuroFilter.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(value, OneEuroFilter.alpha(cutoff, dt));
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

/** Simple exponential smoothing for values that don't need adaptive behavior. */
export class Ema {
  private value: number | null = null;
  constructor(private alpha = 0.2) {}

  push(v: number): number {
    if (!Number.isFinite(v)) return this.value ?? v;
    this.value = this.value === null ? v : this.alpha * v + (1 - this.alpha) * this.value;
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }

  reset() {
    this.value = null;
  }
}
