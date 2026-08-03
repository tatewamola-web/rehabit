/**
 * The webcam Motion Analyst.
 *
 * Everything here runs in this tab: frames go from the camera into WASM and are
 * dropped. No frame is stored, uploaded, or written to disk — what gets saved is
 * a list of numbers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CameraOff,
  CircleDot,
  Crosshair,
  Eye,
  FlipHorizontal,
  Hand,
  Loader2,
  Play,
  Repeat,
  Square,
  Target,
  Video,
} from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import {
  Button,
  Card,
  Chip,
  EstimateNote,
  Field,
  Modal,
  ScaleSlider,
  Segmented,
  Select,
  TextArea,
  cx,
} from '../components/ui';
import { saveSession, uid } from '../lib/db';
import { today } from '../lib/dates';
import { clearCanvas, drawAngle, drawHands, drawNotice, drawPose } from '../lib/drawing';
import {
  METRICS,
  formatValue,
  metricOf,
  overlayJointsFor,
  trackingQualityFor,
  type MetricDef,
} from '../lib/metrics';
import { MissingAssetsError, PoseEngine, checkAssets } from '../lib/pose';
import { RepCounter, type RepEvent } from '../lib/repCounter';
import { useRoute } from '../lib/router';
import { OneEuroFilter } from '../lib/smoothing';
import type { Exercise, SessionLog, Side, TrackingQuality } from '../lib/types';
import { useStore } from '../state/store';

type CameraState = 'idle' | 'starting' | 'live' | 'error';

/** One sample every 100ms is plenty to draw a trend and keeps exports small. */
const SAMPLE_INTERVAL_MS = 100;
const MAX_SAMPLES = 6000;

interface LiveStats {
  value: number | null;
  peak: number | null;
  min: number | null;
  reps: number;
  quality: TrackingQuality;
  hint: string;
  fps: number;
}

const EMPTY_STATS: LiveStats = {
  value: null,
  peak: null,
  min: null,
  reps: 0,
  quality: 'lost',
  hint: '',
  fps: 0,
};

export function MotionPage() {
  const route = useRoute();
  const { exercises, exerciseById, prescriptions, settings, updateSettings } = useStore();

  const trackable = useMemo(() => exercises.filter((e) => e.metric), [exercises]);

  const [exerciseId, setExerciseId] = useState('');
  const [side, setSide] = useState<'left' | 'right'>('right');
  const prescriptionId = route.params.get('rx') ?? undefined;

  // Deep link from Today / My program, otherwise a sensible first pick.
  useEffect(() => {
    const requested = route.params.get('exercise');
    if (requested && exerciseById.has(requested)) {
      setExerciseId(requested);
      const rx = prescriptions.find((p) => p.id === prescriptionId);
      if (rx && rx.side !== 'both') setSide(rx.side);
      else if (settings.affectedSide !== 'unspecified' && settings.affectedSide !== 'both') {
        setSide(settings.affectedSide);
      }
    } else if (!requested && !exerciseId && trackable.length) {
      // Something from the user's own program beats alphabetical order, which
      // would otherwise open on ankle pumps — the least reliable measurement
      // in the app and a poor first impression of the tracking.
      const prescribed = trackable.find((e) =>
        prescriptions.some((p) => p.active && p.exerciseId === e.id),
      );
      const fallback =
        trackable.find((e) => e.id === 'elbow-flexion') ??
        trackable.find((e) => e.metric === 'elbow-flexion') ??
        trackable[0];
      setExerciseId((prescribed ?? fallback).id);
    }
  }, [route.params, exerciseById, prescriptions, prescriptionId, settings.affectedSide, trackable, exerciseId]);

  const exercise = exerciseById.get(exerciseId);
  const metric = metricOf(exercise?.metric);
  const prescription = prescriptions.find((p) => p.id === prescriptionId);
  const target =
    prescription?.targetValue ?? exercise?.defaultTarget ?? metric?.suggestedTarget ?? 90;
  const direction = exercise?.targetDirection ?? 'increase';

  return (
    <>
      <PageHeader
        title="Motion analyst"
        subtitle="Watch your movement, get a live angle, and let it count the reps."
      />
      {trackable.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">
            None of your exercises have a camera measurement attached yet. Open an exercise from the
            library to see which ones can be tracked.
          </p>
        </Card>
      ) : (
        <MotionSession
          key={`${exerciseId}:${side}`}
          exercise={exercise}
          exercises={trackable}
          metric={metric}
          side={side}
          target={target}
          direction={direction}
          prescriptionId={prescriptionId}
          onExerciseChange={setExerciseId}
          onSideChange={setSide}
          mirrored={settings.mirrorCamera}
          onMirrorChange={(v) => updateSettings({ mirrorCamera: v })}
          showNumbers={settings.showLandmarkNumbers}
          onShowNumbersChange={(v) => updateSettings({ showLandmarkNumbers: v })}
          poseModel={settings.poseModel}
        />
      )}
    </>
  );
}

function MotionSession({
  exercise,
  exercises,
  metric,
  side,
  target,
  direction,
  prescriptionId,
  onExerciseChange,
  onSideChange,
  mirrored,
  onMirrorChange,
  showNumbers,
  onShowNumbersChange,
  poseModel,
}: {
  exercise: Exercise | undefined;
  exercises: Exercise[];
  metric: MetricDef | null;
  side: 'left' | 'right';
  target: number;
  direction: 'increase' | 'decrease';
  prescriptionId?: string;
  onExerciseChange: (id: string) => void;
  onSideChange: (s: 'left' | 'right') => void;
  mirrored: boolean;
  onMirrorChange: (v: boolean) => void;
  showNumbers: boolean;
  onShowNumbersChange: (v: boolean) => void;
  poseModel: 'lite' | 'full';
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PoseEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const filterRef = useRef(new OneEuroFilter({ minCutoff: 1.1, beta: 0.05 }));
  const counterRef = useRef<RepCounter | null>(null);

  const recordingRef = useRef(false);
  const seriesRef = useRef<[number, number][]>([]);
  const lastSampleRef = useRef(0);
  const startedAtRef = useRef(0);
  const framesRef = useRef({ total: 0, tracked: 0 });
  const fpsRef = useRef({ frames: 0, since: 0, value: 0 });
  const peakRef = useRef<number | null>(null);
  const minRef = useRef<number | null>(null);

  const [camera, setCamera] = useState<CameraState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<LiveStats>(EMPTY_STATS);
  const [recording, setRecording] = useState(false);
  const [pendingSave, setPendingSave] = useState<Partial<SessionLog> | null>(null);
  const [lastRep, setLastRep] = useState<RepEvent | null>(null);

  const needsHands = metric?.source === 'hand';

  // --- the frame loop -------------------------------------------------------

  const renderFrame = useCallback(() => {
    rafRef.current = requestAnimationFrame(renderFrame);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!video || !canvas || !engine?.ready || video.readyState < 2) return;

    const now = performance.now();
    const result = engine.detect(video, now);
    if (!result) return;

    // Keep the backing store matched to the displayed size and DPR.
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = { width, height };
    clearCanvas(ctx, size);

    let value: number | null = null;
    let quality: TrackingQuality = 'lost';
    let hint = '';

    if (metric) {
      const check = trackingQualityFor(metric, result.frame, side);
      quality = check.quality;
      hint = check.hint;
      const raw = metric.compute(result.frame, side);
      value = raw == null ? null : filterRef.current.filter(raw, now);
    }

    framesRef.current.total++;
    if (value != null) framesRef.current.tracked++;

    const overlay = metric ? overlayJointsFor(metric.id, side) : null;
    const onTarget =
      value != null && (direction === 'increase' ? value >= target : value <= target);

    const drawOpts = {
      mirrored,
      showNumbers,
      dimmed: quality === 'lost',
      onTarget,
      highlight: overlay
        ? { a: overlay.a, b: overlay.b, c: overlay.c, targetVertex: overlay.toVertex(target) }
        : undefined,
      readout: value != null && metric ? formatValue(value, metric.unit) : undefined,
    };

    if (result.draw.pose) {
      drawPose(ctx, result.draw.pose, size, drawOpts);
      if (overlay) drawAngle(ctx, result.draw.pose, size, drawOpts);
    }
    if (result.draw.hands.length) drawHands(ctx, result.draw.hands, size, drawOpts);
    if (!result.draw.pose && !result.draw.hands.length) {
      drawNotice(ctx, size, 'Looking for you…');
    } else if (hint) {
      drawNotice(ctx, size, hint);
    }

    // Reps and recording.
    let reps = counterRef.current?.count ?? 0;
    if (recordingRef.current && counterRef.current) {
      const event = counterRef.current.push(value, now);
      if (event) {
        setLastRep(event);
        reps = counterRef.current.count;
      }
      if (value != null) {
        peakRef.current = peakRef.current == null ? value : Math.max(peakRef.current, value);
        minRef.current = minRef.current == null ? value : Math.min(minRef.current, value);
        if (now - lastSampleRef.current >= SAMPLE_INTERVAL_MS && seriesRef.current.length < MAX_SAMPLES) {
          lastSampleRef.current = now;
          seriesRef.current.push([Math.round(now - startedAtRef.current), Math.round(value * 10) / 10]);
        }
      }
    }

    // FPS, sampled once a second so the readout doesn't flicker.
    const fps = fpsRef.current;
    fps.frames++;
    if (now - fps.since >= 1000) {
      fps.value = Math.round((fps.frames * 1000) / (now - fps.since));
      fps.frames = 0;
      fps.since = now;
    }

    setStats({
      value,
      peak: peakRef.current,
      min: minRef.current,
      reps,
      quality,
      hint,
      fps: fps.value,
    });
  }, [direction, metric, mirrored, showNumbers, side, target]);

  // --- camera lifecycle -----------------------------------------------------

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    engineRef.current?.close();
    engineRef.current = null;
    recordingRef.current = false;
    setRecording(false);
    setCamera('idle');
    setStats(EMPTY_STATS);
  }, []);

  const startCamera = useCallback(async () => {
    setCamera('starting');
    setError(null);
    try {
      const assets = await checkAssets();
      if (!assets.ok) {
        throw new MissingAssetsError(assets.missing.join(', '));
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('Video element missing.');
      video.srcObject = stream;
      await video.play();

      const engine = new PoseEngine({ poseModel, trackHands: needsHands });
      await engine.init();
      engineRef.current = engine;

      filterRef.current.reset();
      fpsRef.current = { frames: 0, since: performance.now(), value: 0 };
      setCamera('live');
      rafRef.current = requestAnimationFrame(renderFrame);
    } catch (err) {
      stopCamera();
      setCamera('error');
      setError(describeCameraError(err));
    }
  }, [needsHands, poseModel, renderFrame, stopCamera]);

  // Swap hand tracking on when the chosen exercise needs it.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine?.ready) return;
    if (needsHands && !engine.trackingHands) void engine.enableHands();
    if (!needsHands && engine.trackingHands) engine.disableHands();
  }, [needsHands]);

  useEffect(() => stopCamera, [stopCamera]);

  // --- recording ------------------------------------------------------------

  const startRecording = () => {
    counterRef.current = new RepCounter({
      direction,
      target,
      minAmplitude: metric?.unit === '%' ? 15 : 12,
    });
    seriesRef.current = [];
    framesRef.current = { total: 0, tracked: 0 };
    peakRef.current = null;
    minRef.current = null;
    startedAtRef.current = performance.now();
    lastSampleRef.current = 0;
    setLastRep(null);
    recordingRef.current = true;
    setRecording(true);
  };

  const stopRecording = () => {
    recordingRef.current = false;
    setRecording(false);
    const counter = counterRef.current;
    const durationSeconds = (performance.now() - startedAtRef.current) / 1000;
    const { total, tracked } = framesRef.current;
    const peaks = counter?.reps.map((r) => Math.round(r.peak * 10) / 10) ?? [];
    const best = direction === 'increase' ? peakRef.current : minRef.current;

    setPendingSave({
      exerciseId: exercise?.id,
      prescriptionId,
      metric: metric?.id,
      targetValue: target,
      repsCompleted: counter?.count ?? 0,
      repPeaks: peaks,
      peakValue: peakRef.current ?? undefined,
      minValue: minRef.current ?? undefined,
      series: seriesRef.current.slice(),
      durationSeconds,
      trackingScore: total ? tracked / total : 0,
      reachedTarget:
        best != null && (direction === 'increase' ? best >= target : best <= target),
      side: side as Side,
    });
  };

  if (!exercise || !metric) {
    return (
      <Card>
        <p className="text-sm text-ink-soft">Choose a trackable exercise to begin.</p>
      </Card>
    );
  }

  const onTarget =
    stats.value != null && (direction === 'increase' ? stats.value >= target : stats.value <= target);

  return (
    <div className="space-y-5">
      {/* Setup */}
      <Card className="!p-4">
        <div className="grid sm:grid-cols-[2fr_1fr] gap-4">
          <Field label="Exercise" htmlFor="motion-exercise">
            <Select
              id="motion-exercise"
              value={exercise.id}
              onChange={(e) => onExerciseChange(e.target.value)}
              disabled={camera === 'live' && recording}
            >
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          {exercise.bilateral ? (
            <Field label="Side">
              <Segmented
                label="Side"
                value={side}
                onChange={onSideChange}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                ]}
              />
            </Field>
          ) : (
            <div />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-line">
          <Chip tone="brand">
            <Target size={11} /> target {target}
            {metric.unit} {metric.short.toLowerCase()}
          </Chip>
          <Chip tone="accent">
            <Crosshair size={11} />
            {metric.cameraView === 'front'
              ? 'face the camera'
              : metric.cameraView === 'side'
                ? 'stand side-on'
                : 'either view'}
          </Chip>
          {needsHands ? (
            <Chip>
              <Hand size={11} /> hand tracking on
            </Chip>
          ) : null}
        </div>
        <p className="text-xs text-ink-soft mt-2.5 leading-relaxed">{metric.note}</p>
      </Card>

      {/* Video */}
      <div className="relative rounded-2xl overflow-hidden border border-line bg-[#0b1220] aspect-video">
        <video
          ref={videoRef}
          playsInline
          muted
          className={cx(
            'absolute inset-0 w-full h-full object-cover',
            mirrored && 'scale-x-[-1]',
            camera !== 'live' && 'opacity-0',
          )}
        />
        <canvas
          ref={canvasRef}
          className={cx('absolute inset-0 w-full h-full', camera !== 'live' && 'hidden')}
        />

        {camera === 'live' ? (
          <div className="absolute top-3 left-3 right-3 flex flex-wrap items-start gap-2 pointer-events-none">
            <div
              className={cx(
                'rounded-xl px-3 py-2 backdrop-blur text-white/95 text-sm font-medium flex items-center gap-2',
                stats.quality === 'good'
                  ? 'bg-emerald-600/75'
                  : stats.quality === 'partial'
                    ? 'bg-amber-600/75'
                    : 'bg-rose-600/75',
              )}
            >
              <Eye size={14} />
              {stats.quality === 'good'
                ? 'Tracking'
                : stats.quality === 'partial'
                  ? 'Partly visible'
                  : 'Cannot see you'}
            </div>
            {recording ? (
              <div className="rounded-xl px-3 py-2 bg-rose-600/80 backdrop-blur text-white text-sm font-medium flex items-center gap-2">
                <CircleDot size={14} className="pulse-soft" />
                Recording
              </div>
            ) : null}
            <div className="ml-auto rounded-xl px-3 py-2 bg-black/50 backdrop-blur text-white/80 text-xs tabular">
              {stats.fps} fps
            </div>
          </div>
        ) : null}

        {camera !== 'live' ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            {camera === 'starting' ? (
              <div className="text-white/80 flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin" />
                <p className="text-sm">Starting camera and loading the model…</p>
              </div>
            ) : camera === 'error' ? (
              <div className="max-w-md text-white/85 flex flex-col items-center gap-3">
                <AlertTriangle size={28} className="text-amber-400" />
                <p className="text-sm leading-relaxed">{error}</p>
                <Button variant="secondary" onClick={startCamera}>
                  Try again
                </Button>
              </div>
            ) : (
              <div className="max-w-md text-white/85 flex flex-col items-center gap-4">
                <CameraOff size={30} className="text-white/50" />
                <div>
                  <p className="font-medium text-white">The camera is off</p>
                  <p className="text-sm text-white/70 mt-1.5 leading-relaxed">
                    Nothing is recorded or uploaded. Frames are analysed on this computer and
                    discarded — only the numbers are saved, and only if you press record.
                  </p>
                </div>
                <Button variant="primary" size="lg" icon={<Video size={18} />} onClick={startCamera}>
                  Turn on camera
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Live readout */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ReadoutTile
          label="Now"
          value={formatValue(stats.value, metric.unit)}
          tone={onTarget ? 'ok' : 'neutral'}
        />
        <ReadoutTile
          label={direction === 'increase' ? 'Best today' : 'Closest today'}
          value={formatValue(direction === 'increase' ? stats.peak : stats.min, metric.unit)}
        />
        <ReadoutTile label="Target" value={`${target}${metric.unit}`} tone="accent" />
        <ReadoutTile
          label="Reps"
          value={String(stats.reps)}
          sub={lastRep ? `last ${Math.round(lastRep.peak)}${metric.unit}` : undefined}
        />
      </div>

      {/* Controls */}
      <Card className="!p-4">
        <div className="flex flex-wrap items-center gap-2">
          {camera === 'live' ? (
            recording ? (
              <Button variant="primary" size="lg" icon={<Square size={17} />} onClick={stopRecording}>
                Stop and save
              </Button>
            ) : (
              <Button variant="primary" size="lg" icon={<Play size={17} />} onClick={startRecording}>
                Start recording
              </Button>
            )
          ) : null}
          {camera === 'live' ? (
            <>
              <Button icon={<FlipHorizontal size={16} />} onClick={() => onMirrorChange(!mirrored)}>
                {mirrored ? 'Mirrored' : 'Not mirrored'}
              </Button>
              <Button
                icon={<Crosshair size={16} />}
                onClick={() => onShowNumbersChange(!showNumbers)}
              >
                {showNumbers ? 'Hide landmark names' : 'Show landmark names'}
              </Button>
              <Button
                icon={<Repeat size={16} />}
                onClick={() => {
                  filterRef.current.reset();
                  counterRef.current?.reset();
                  peakRef.current = null;
                  minRef.current = null;
                }}
              >
                Reset counters
              </Button>
              <Button variant="ghost" onClick={stopCamera} className="ml-auto">
                Turn camera off
              </Button>
            </>
          ) : null}
        </div>

        {stats.hint && camera === 'live' ? (
          <p className="text-sm text-accent-ink bg-accent-soft border border-accent/30 rounded-xl px-3.5 py-2.5 mt-3">
            {stats.hint}
          </p>
        ) : null}

        <EstimateNote className="mt-3" />
      </Card>

      <SaveTrackedDialog
        draft={pendingSave}
        exerciseName={exercise.name}
        unit={metric.unit}
        onClose={() => setPendingSave(null)}
      />
    </div>
  );
}

function ReadoutTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'ok' | 'accent';
}) {
  const tones = {
    neutral: 'text-ink',
    ok: 'text-ok',
    accent: 'text-accent-ink',
  } as const;
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={cx('text-3xl font-semibold tabular mt-0.5', tones[tone])}>{value}</p>
      {sub ? <p className="text-xs text-ink-faint mt-0.5">{sub}</p> : null}
    </div>
  );
}

function SaveTrackedDialog({
  draft,
  exerciseName,
  unit,
  onClose,
}: {
  draft: Partial<SessionLog> | null;
  exerciseName: string;
  unit: '°' | '%';
  onClose: () => void;
}) {
  const [pain, setPain] = useState<number | undefined>(undefined);
  const [fatigue, setFatigue] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (draft) {
      setPain(undefined);
      setFatigue(undefined);
      setNotes('');
    }
  }, [draft]);

  if (!draft) return null;

  const poorTracking = (draft.trackingScore ?? 0) < 0.6;

  const save = async () => {
    await saveSession({
      id: uid(),
      exerciseId: draft.exerciseId!,
      prescriptionId: draft.prescriptionId,
      day: today(),
      startedAt: Date.now(),
      durationSeconds: draft.durationSeconds,
      side: draft.side ?? 'both',
      source: 'tracked',
      setsCompleted: 1,
      repsCompleted: draft.repsCompleted ?? 0,
      metric: draft.metric,
      targetValue: draft.targetValue,
      peakValue: draft.peakValue,
      minValue: draft.minValue,
      repPeaks: draft.repPeaks,
      series: draft.series,
      reachedTarget: draft.reachedTarget,
      trackingScore: draft.trackingScore,
      pain,
      fatigue,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Save this session?"
      footer={
        <>
          <Button onClick={onClose}>Discard</Button>
          <Button variant="primary" onClick={save}>
            Save to log
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <p className="font-medium">{exerciseName}</p>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <p className="text-xs text-ink-faint uppercase tracking-wide">Reps</p>
              <p className="text-xl font-semibold tabular">{draft.repsCompleted ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint uppercase tracking-wide">Best</p>
              <p className="text-xl font-semibold tabular">
                {draft.peakValue != null ? `${Math.round(draft.peakValue)}${unit}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-faint uppercase tracking-wide">Target</p>
              <p className="text-xl font-semibold tabular">
                {draft.targetValue}
                {unit}
              </p>
            </div>
          </div>
          <div className="mt-3">
            {draft.reachedTarget ? (
              <Chip tone="ok">Reached the target range at least once</Chip>
            ) : (
              <Chip>Did not reach the target this time — that is normal, and it is the trend that matters</Chip>
            )}
          </div>
        </div>

        {poorTracking ? (
          <div className="rounded-xl border border-accent/35 bg-accent-soft px-4 py-3 flex gap-3">
            <AlertTriangle size={18} className="text-accent-ink shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              The camera only had a clear view for{' '}
              <strong>{Math.round((draft.trackingScore ?? 0) * 100)}%</strong> of this session, so
              these numbers are shakier than usual. Saving is fine — just take the angle with a
              pinch of salt, and try more light or a plainer background next time.
            </p>
          </div>
        ) : null}

        <div className="space-y-4 rounded-xl border border-line bg-surface-2 p-4">
          <ScaleSlider
            label="Pain during or after"
            value={pain}
            onChange={setPain}
            lowLabel="none"
            highLabel="worst imaginable"
            tone="danger"
          />
          <ScaleSlider
            label="Fatigue"
            value={fatigue}
            onChange={setFatigue}
            lowLabel="fresh"
            highLabel="exhausted"
          />
        </div>

        <Field label="Notes">
          <TextArea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering about this one…"
          />
        </Field>
      </div>
    </Modal>
  );
}

function describeCameraError(err: unknown): string {
  if (err instanceof MissingAssetsError) return err.message;
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
        return 'Camera access was blocked. Allow camera permission for this page in your browser settings, then try again.';
      case 'NotFoundError':
        return 'No camera was found. Plug one in or check that another app is not using it.';
      case 'NotReadableError':
        return 'The camera is busy — another app is probably using it. Close that and try again.';
      default:
        return `The camera could not start (${err.name}).`;
    }
  }
  return err instanceof Error ? err.message : 'The camera could not start.';
}

/** Exported for the Progress page's metric labels. */
export const METRIC_LABELS = Object.fromEntries(
  Object.entries(METRICS).map(([id, def]) => [id, def.short]),
) as Record<string, string>;
