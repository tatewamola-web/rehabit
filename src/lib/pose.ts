/**
 * The on-device pose engine.
 *
 * Both models and the WASM runtime are served from this app's own public
 * folder (vendored by `npm run setup`), so nothing is fetched from a CDN and
 * the camera feed never leaves the tab — inference happens frame by frame in
 * WebAssembly and the frames are discarded immediately.
 */
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type HandLandmarkerResult,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { POSE } from './landmarks';
import type { DetectedHand, Frame, Pt } from './metrics';

const WASM_PATH = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const MODEL_BASE = `${import.meta.env.BASE_URL}models`;

export interface EngineOptions {
  poseModel: 'lite' | 'full';
  /** Hand tracking roughly doubles the per-frame cost, so it's opt-in. */
  trackHands: boolean;
}

export interface DetectionResult {
  /** Aspect-corrected points, for angle maths. */
  frame: Frame;
  /** Raw normalized 0–1 points, for drawing on the canvas. */
  draw: { pose: Pt[] | null; hands: DetectedHand[] };
  timestampMs: number;
}

export class MissingAssetsError extends Error {
  constructor(cause: string) {
    super(
      `Pose model files are missing. Run "npm run setup" in the project folder to download them. (${cause})`,
    );
    this.name = 'MissingAssetsError';
  }
}

/** The assets are present but the model would not start on this machine. */
export class PoseEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PoseEngineError';
  }
}

const describe = (err: unknown) =>
  err instanceof Error ? err.message.split('\n')[0].slice(0, 120) : String(err).slice(0, 120);

function toPts(landmarks: { x: number; y: number; visibility?: number }[], aspect: number): Pt[] {
  return landmarks.map((l) => ({
    x: l.x * aspect,
    y: l.y,
    score: l.visibility ?? 1,
  }));
}

function toDrawPts(landmarks: { x: number; y: number; visibility?: number }[]): Pt[] {
  return landmarks.map((l) => ({ x: l.x, y: l.y, score: l.visibility ?? 1 }));
}

/**
 * MediaPipe's own handedness label assumes a mirrored (selfie) input, which is
 * a coin flip for an arbitrary webcam. When we have a body pose we can do
 * better: whichever pose wrist the hand is sitting on top of is the answer.
 */
function assignHandSides(
  hands: HandLandmarkerResult,
  posePts: Pt[] | null,
): { index: number; side: 'left' | 'right'; confidence: number }[] {
  return hands.landmarks.map((lm, i) => {
    const label = hands.handedness?.[i]?.[0];
    const confidence = label?.score ?? 0.5;
    // MediaPipe's label, un-mirrored, is our starting guess.
    let side: 'left' | 'right' = label?.categoryName === 'Left' ? 'right' : 'left';

    const wrist = lm[0];
    if (posePts && wrist) {
      const left = posePts[POSE.leftWrist];
      const right = posePts[POSE.rightWrist];
      const near = (p?: Pt) => (p && p.score > 0.4 ? Math.hypot(p.x - wrist.x, p.y - wrist.y) : Infinity);
      const dl = near(left);
      const dr = near(right);
      if (Number.isFinite(dl) || Number.isFinite(dr)) side = dl <= dr ? 'left' : 'right';
    }
    return { index: i, side, confidence };
  });
}

export class PoseEngine {
  private pose: PoseLandmarker | null = null;
  private hands: HandLandmarker | null = null;
  private lastTimestamp = -1;
  private options: EngineOptions;

  /** Which inference path we ended up on. Surfaced so slow ≠ unexplained. */
  delegate: 'GPU' | 'CPU' | null = null;

  constructor(options: EngineOptions) {
    this.options = options;
  }

  get ready(): boolean {
    return this.pose !== null;
  }

  get trackingHands(): boolean {
    return this.hands !== null;
  }

  /**
   * Tries the GPU delegate and falls back to CPU.
   *
   * The GPU path needs WebGL2 that MediaPipe is willing to use, and that is not
   * a given: virtual machines, remote desktops, older integrated graphics, and
   * drivers on the browser's blocklist all fail it. On those machines the app
   * still works — CPU inference is several times slower but far from unusable —
   * so falling back beats refusing to start. Which one we got is reported so
   * the UI can explain a low frame rate instead of leaving it a mystery.
   */
  private async createWithFallback<T>(
    create: (delegate: 'GPU' | 'CPU') => Promise<T>,
    label: string,
  ): Promise<T> {
    try {
      const task = await create('GPU');
      this.delegate = 'GPU';
      return task;
    } catch (gpuError) {
      try {
        const task = await create('CPU');
        this.delegate = 'CPU';
        return task;
      } catch (cpuError) {
        // Both failed. If the files aren't there, say so — that's fixable by
        // the user. Otherwise report what actually went wrong rather than
        // sending them off to re-download models that are already present.
        const assets = await checkAssets();
        if (!assets.ok) throw new MissingAssetsError(assets.missing.join(', '));
        throw new PoseEngineError(
          `Could not start the ${label} model on this computer. ` +
            `The graphics path failed (${describe(gpuError)}) and so did the fallback ` +
            `(${describe(cpuError)}). Your browser may be too old, or blocking WebAssembly.`,
        );
      }
    }
  }

  async init(): Promise<void> {
    let fileset;
    try {
      fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    } catch {
      // The runtime is the first thing loaded, so a failure here is almost
      // always the vendored files being absent.
      const assets = await checkAssets();
      throw new MissingAssetsError(assets.missing.join(', ') || 'wasm runtime');
    }

    const modelFile =
      this.options.poseModel === 'full' ? 'pose_landmarker_full.task' : 'pose_landmarker_lite.task';

    this.pose = await this.createWithFallback(
      (delegate) =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: `${MODEL_BASE}/${modelFile}`, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputSegmentationMasks: false,
        }),
      'body pose',
    );

    if (this.options.trackHands) await this.enableHands();
  }

  /**
   * Resolves either way. Hand tracking is an enhancement to a session that is
   * already working, so a failure here downgrades to body-only rather than
   * taking down the whole page.
   */
  async enableHands(): Promise<boolean> {
    if (this.hands) return true;
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      this.hands = await this.createWithFallback(
        (delegate) =>
          HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: `${MODEL_BASE}/hand_landmarker.task`, delegate },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.4,
            minHandPresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
          }),
        'hand',
      );
      return true;
    } catch {
      this.hands = null;
      return false;
    }
  }

  disableHands(): void {
    this.hands?.close();
    this.hands = null;
  }

  /**
   * Run one frame. MediaPipe's VIDEO mode requires strictly increasing
   * timestamps, so repeated or stale frames are nudged forward rather than
   * throwing.
   */
  detect(video: HTMLVideoElement, timestampMs: number): DetectionResult | null {
    if (!this.pose || video.readyState < 2) return null;
    const ts = timestampMs <= this.lastTimestamp ? this.lastTimestamp + 1 : timestampMs;
    this.lastTimestamp = ts;

    const width = video.videoWidth || 1;
    const height = video.videoHeight || 1;
    const aspect = width / height;

    let poseResult: PoseLandmarkerResult | null = null;
    let handResult: HandLandmarkerResult | null = null;
    try {
      poseResult = this.pose.detectForVideo(video, ts);
      if (this.hands) handResult = this.hands.detectForVideo(video, ts);
    } catch {
      return null;
    }

    const poseLm = poseResult?.landmarks?.[0] ?? null;
    const posePts = poseLm ? toPts(poseLm, aspect) : null;
    const poseDraw = poseLm ? toDrawPts(poseLm) : null;

    const handsCorrected: DetectedHand[] = [];
    const handsDraw: DetectedHand[] = [];
    if (handResult?.landmarks?.length) {
      for (const { index, side, confidence } of assignHandSides(handResult, posePts)) {
        const lm = handResult.landmarks[index];
        handsCorrected.push({ side, confidence, points: toPts(lm, aspect) });
        handsDraw.push({ side, confidence, points: toDrawPts(lm) });
      }
    }

    return {
      frame: { pose: posePts, hands: handsCorrected },
      draw: { pose: poseDraw, hands: handsDraw },
      timestampMs: ts,
    };
  }

  close(): void {
    this.pose?.close();
    this.pose = null;
    this.disableHands();
    this.lastTimestamp = -1;
    this.delegate = null;
  }
}

/** Are the vendored assets actually there? Checked before opening the camera. */
export async function checkAssets(): Promise<{ ok: boolean; missing: string[] }> {
  const files = [`${MODEL_BASE}/pose_landmarker_lite.task`, `${WASM_PATH}/vision_wasm_internal.js`];
  const missing: string[] = [];
  await Promise.all(
    files.map(async (url) => {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        if (!res.ok) missing.push(url);
      } catch {
        missing.push(url);
      }
    }),
  );
  return { ok: missing.length === 0, missing };
}
