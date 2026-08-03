/**
 * Two views behind one heading: the catalogue you pick from, and the program
 * you have actually been given.
 *
 * The catalogue is a two-level accordion — body area, then exercise — rather
 * than a wall of cards. Fifty exercises is a lot to scroll past when you only
 * came to find the one on your sheet, and collapsing by body area means the
 * whole library fits on one screen. Details open inline instead of in a dialog
 * so you never lose your place in the list.
 */
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  Info,
  Pencil,
  Plus,
  Search,
  Trash2,
  Video,
} from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import { LogSessionDialog } from '../components/LogSessionDialog';
import { PrescriptionDialog } from '../components/PrescriptionDialog';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Modal,
  Segmented,
  Select,
  TextArea,
  TextInput,
  Toggle,
  cx,
} from '../components/ui';
import { createExercise, deletePrescription, putPrescription, removeExercise } from '../lib/db';
import { WEEKDAY_INITIALS } from '../lib/dates';
import { METRIC_LIST, metricOf } from '../lib/metrics';
import { navigate } from '../lib/router';
import { CATEGORY_LABELS, type Exercise, type ExerciseCategory, type MetricId } from '../lib/types';
import { useStore } from '../state/store';

type Tab = 'library' | 'program';

export function ExercisesPage() {
  const { exercises, prescriptions, exerciseById, settings } = useStore();
  const [tab, setTab] = useState<Tab>('library');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all');
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [rxDialog, setRxDialog] = useState<{ open: boolean; exerciseId?: string; editing?: string }>(
    { open: false },
  );
  const [logFor, setLogFor] = useState<Exercise | null>(null);
  const [showCustom, setShowCustom] = useState(false);

  const searching = query.trim().length > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((e) => {
      if (category !== 'all' && e.category !== category) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.tags.some((t) => t.includes(q))
      );
    });
  }, [exercises, query, category]);

  const grouped = useMemo(() => {
    const map = new Map<ExerciseCategory, Exercise[]>();
    for (const e of filtered) {
      const list = map.get(e.category) ?? [];
      list.push(e);
      map.set(e.category, list);
    }
    return [...map.entries()].sort(([a], [b]) =>
      CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b]),
    );
  }, [filtered]);

  const toggleCategory = (cat: string) =>
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Exercises"
        subtitle="Find the ones you were given, then record the dose your therapist asked for."
        action={
          <Button icon={<Plus size={17} />} onClick={() => setShowCustom(true)}>
            Custom exercise
          </Button>
        }
      />

      <div className="mb-6 max-w-sm">
        <Segmented
          label="View"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'library', label: `Library (${exercises.length})` },
            { value: 'program', label: `My program (${prescriptions.length})` },
          ]}
        />
      </div>

      {tab === 'library' ? (
        <>
          <div className="flex flex-wrap gap-3 mb-5">
            <div className="relative grow min-w-56">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
              />
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search — try “shoulder”, “fist”, “balance”"
                className="!pl-9"
                aria-label="Search exercises"
              />
            </div>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExerciseCategory | 'all')}
              aria-label="Filter by body area"
              className="!w-auto min-w-44"
            >
              <option value="all">All body areas</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          {grouped.length > 1 ? (
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                className="text-xs text-brand-ink underline underline-offset-2"
                onClick={() => setOpenCategories(new Set(grouped.map(([c]) => c)))}
              >
                Expand all
              </button>
              <span aria-hidden className="text-ink-faint text-xs">
                ·
              </span>
              <button
                type="button"
                className="text-xs text-ink-soft underline underline-offset-2"
                onClick={() => {
                  setOpenCategories(new Set());
                  setOpenExercise(null);
                }}
              >
                Collapse all
              </button>
            </div>
          ) : null}

          {grouped.length === 0 ? (
            <Card>
              <EmptyState
                title="Nothing matched"
                body="If your therapist gave you something that isn’t listed, add it as a custom exercise."
                action={
                  <Button variant="primary" onClick={() => setShowCustom(true)}>
                    Add a custom exercise
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {grouped.map(([cat, items]) => {
                // While searching, show what matched instead of making people
                // open every drawer to find out where the results are.
                const open = searching || openCategories.has(cat);
                const inProgram = items.filter((e) =>
                  prescriptions.some((p) => p.exerciseId === e.id && p.active),
                ).length;
                return (
                  <div key={cat} className="card overflow-hidden !p-0">
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      aria-expanded={open}
                      aria-controls={`cat-${cat}`}
                      className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-surface-2 transition min-h-14"
                    >
                      <ChevronDown
                        size={18}
                        className={cx(
                          'text-ink-faint shrink-0 transition-transform',
                          !open && '-rotate-90',
                        )}
                      />
                      <span className="font-medium grow">{CATEGORY_LABELS[cat]}</span>
                      {inProgram ? (
                        <Chip tone="ok">
                          <Check size={12} /> {inProgram} in program
                        </Chip>
                      ) : null}
                      <span className="text-sm text-ink-faint tabular shrink-0">
                        {items.length}
                      </span>
                    </button>

                    {open ? (
                      <ul id={`cat-${cat}`} className="border-t border-line">
                        {items.map((exercise) => (
                          <ExerciseRow
                            key={exercise.id}
                            exercise={exercise}
                            expanded={openExercise === exercise.id}
                            prescribed={prescriptions.some(
                              (p) => p.exerciseId === exercise.id && p.active,
                            )}
                            onToggle={() =>
                              setOpenExercise((cur) => (cur === exercise.id ? null : exercise.id))
                            }
                            onAdd={() => setRxDialog({ open: true, exerciseId: exercise.id })}
                            onDelete={() => {
                              if (confirm('Remove this custom exercise?')) {
                                removeExercise(exercise.id);
                                setOpenExercise(null);
                              }
                            }}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <ProgramList
          onEdit={(id) => setRxDialog({ open: true, editing: id })}
          onLog={(id) => setLogFor(exerciseById.get(id) ?? null)}
        />
      )}

      <PrescriptionDialog
        open={rxDialog.open}
        onClose={() => setRxDialog({ open: false })}
        exercises={exercises}
        presetExerciseId={rxDialog.exerciseId}
        editing={prescriptions.find((p) => p.id === rxDialog.editing)}
        defaultSide={settings.affectedSide === 'unspecified' ? undefined : settings.affectedSide}
      />

      <LogSessionDialog open={!!logFor} onClose={() => setLogFor(null)} exercise={logFor ?? undefined} />

      <CustomExerciseDialog open={showCustom} onClose={() => setShowCustom(false)} />
    </>
  );
}

// --- one exercise, collapsed or expanded ------------------------------------

function ExerciseRow({
  exercise,
  expanded,
  prescribed,
  onToggle,
  onAdd,
  onDelete,
}: {
  exercise: Exercise;
  expanded: boolean;
  prescribed: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const metric = metricOf(exercise.metric);

  return (
    <li className={cx('border-b border-line last:border-b-0', expanded && 'bg-surface-2/50')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`ex-${exercise.id}`}
        className="w-full flex items-start gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-surface-2 transition min-h-14"
      >
        <ChevronDown
          size={16}
          className={cx('text-ink-faint shrink-0 mt-1 transition-transform', !expanded && '-rotate-90')}
        />
        <span className="min-w-0 grow">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{exercise.name}</span>
            {prescribed ? (
              <Chip tone="ok">
                <Check size={12} /> in program
              </Chip>
            ) : null}
            {!exercise.builtIn ? <Chip>custom</Chip> : null}
          </span>
          <span className="block text-sm text-ink-soft mt-0.5 leading-relaxed">
            {exercise.summary}
          </span>
        </span>
        <span className="shrink-0 hidden sm:flex gap-1.5 pt-0.5">
          {metric ? (
            <Chip tone="brand">
              <Camera size={11} /> {metric.short}
            </Chip>
          ) : (
            <Chip>manual</Chip>
          )}
        </span>
      </button>

      {expanded ? (
        <div id={`ex-${exercise.id}`} className="px-4 sm:px-5 pb-5 pt-1 animate-in">
          <div className="sm:pl-7 space-y-5">
            <div className="flex flex-wrap gap-1.5 sm:hidden">
              {metric ? (
                <Chip tone="brand">
                  <Camera size={11} /> {metric.short}
                </Chip>
              ) : (
                <Chip>manual log</Chip>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {exercise.strokeNote ? <Chip tone="accent">stroke focus</Chip> : null}
              {exercise.holdBased ? <Chip>held, not repeated</Chip> : null}
              {exercise.equipment?.map((item) => <Chip key={item}>{item}</Chip>)}
            </div>

            {exercise.safety ? (
              <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 flex gap-3">
                <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
                <p className="text-sm leading-relaxed">{exercise.safety}</p>
              </div>
            ) : null}

            {exercise.steps.length ? (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-2">
                  How it is usually done
                </h4>
                <ol className="space-y-2">
                  {exercise.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed">
                      <span className="shrink-0 w-5.5 h-5.5 rounded-full bg-brand-soft text-brand-ink grid place-items-center text-[0.7rem] font-semibold mt-0.5">
                        {i + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {exercise.cues.length ? (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-2">
                  Things to watch for
                </h4>
                <ul className="space-y-1.5">
                  {exercise.cues.map((cue, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-ink-soft leading-relaxed">
                      <span aria-hidden className="text-brand">
                        •
                      </span>
                      {cue}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {exercise.strokeNote ? (
              <div className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink mb-1">
                  After a stroke
                </p>
                <p className="text-sm leading-relaxed">{exercise.strokeNote}</p>
              </div>
            ) : null}

            {metric ? (
              <div className="rounded-xl border border-line bg-surface px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-1">
                  Camera tracking
                </p>
                <p className="text-sm leading-relaxed">
                  Measures <strong>{metric.label.toLowerCase()}</strong>.{' '}
                  {metric.cameraView === 'front'
                    ? 'Stand facing the camera.'
                    : metric.cameraView === 'side'
                      ? 'Stand side-on to the camera.'
                      : 'Either view works.'}{' '}
                  {metric.note}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-surface px-4 py-3 flex gap-3">
                <Info size={17} className="text-ink-faint shrink-0 mt-0.5" />
                <p className="text-sm text-ink-soft leading-relaxed">
                  This one is logged by hand. A single webcam cannot measure it reliably — usually
                  because the movement is a rotation, or too small to see — and a made-up number
                  would be worse than none.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={onAdd}>
                Add to program
              </Button>
              {metric ? (
                <Button
                  icon={<Video size={16} />}
                  onClick={() => navigate('/motion', { exercise: exercise.id })}
                >
                  Try with the camera
                </Button>
              ) : null}
              {!exercise.builtIn ? (
                <Button variant="danger" icon={<Trash2 size={15} />} onClick={onDelete}>
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// --- my program -------------------------------------------------------------

function ProgramList({
  onEdit,
  onLog,
}: {
  onEdit: (id: string) => void;
  onLog: (exerciseId: string) => void;
}) {
  const { prescriptions, exerciseById } = useStore();

  if (!prescriptions.length) {
    return (
      <Card>
        <EmptyState
          title="No prescriptions yet"
          body="Add exercises from the library with the sets, reps and frequency you were given. They will then appear on Today."
        />
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {prescriptions.map((rx) => {
        const exercise = exerciseById.get(rx.exerciseId);
        const metric = metricOf(exercise?.metric);
        return (
          <Card as="li" key={rx.id} className={cx(!rx.active && 'opacity-60')}>
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 grow">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{exercise?.name ?? 'Removed exercise'}</p>
                  {!rx.active ? <Chip>paused</Chip> : null}
                  {rx.side !== 'both' ? <Chip>{rx.side}</Chip> : null}
                </div>
                <p className="text-sm text-ink-soft mt-1">
                  {rx.sets} × {rx.reps}
                  {rx.holdSeconds ? `, hold ${rx.holdSeconds}s` : ''} · {rx.timesPerDay}× a day
                </p>
                <div className="flex gap-1 mt-2">
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <span
                      key={d}
                      className={cx(
                        'w-6 h-6 grid place-items-center rounded-md text-[0.65rem] font-semibold',
                        rx.daysOfWeek.includes(d)
                          ? 'bg-brand-soft text-brand-ink'
                          : 'bg-surface-2 text-ink-faint',
                      )}
                    >
                      {WEEKDAY_INITIALS[d]}
                    </span>
                  ))}
                </div>
                {rx.prescribedBy ? (
                  <p className="text-xs text-ink-faint mt-2">Prescribed by {rx.prescribedBy}</p>
                ) : null}
                {rx.notes ? <p className="text-sm text-ink-soft mt-1.5 italic">“{rx.notes}”</p> : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {metric && exercise ? (
                  <Button
                    size="sm"
                    icon={<Video size={15} />}
                    onClick={() => navigate('/motion', { exercise: exercise.id, rx: rx.id })}
                  >
                    Camera
                  </Button>
                ) : null}
                <Button size="sm" onClick={() => onLog(rx.exerciseId)}>
                  Log
                </Button>
                <Button size="sm" icon={<Pencil size={15} />} onClick={() => onEdit(rx.id)}>
                  Edit
                </Button>
                <Button size="sm" onClick={() => putPrescription({ ...rx, active: !rx.active })}>
                  {rx.active ? 'Pause' : 'Resume'}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={15} />}
                  onClick={() => {
                    if (confirm('Remove this from your program? Past logs are kept.')) {
                      deletePrescription(rx.id);
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </ul>
  );
}

// --- custom exercise --------------------------------------------------------

function CustomExerciseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState<ExerciseCategory>('shoulder-elbow');
  const [steps, setSteps] = useState('');
  const [metric, setMetric] = useState<MetricId | ''>('');
  const [target, setTarget] = useState('');
  const [bilateral, setBilateral] = useState(true);
  const [holdBased, setHoldBased] = useState(false);

  const reset = () => {
    setName('');
    setSummary('');
    setSteps('');
    setMetric('');
    setTarget('');
    setBilateral(true);
    setHoldBased(false);
  };

  const save = async () => {
    if (!name.trim()) return;
    await createExercise({
      name: name.trim(),
      category,
      summary: summary.trim() || 'Added by you.',
      steps: steps
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      cues: [],
      metric: metric || undefined,
      defaultTarget: target.trim() ? Number(target) : undefined,
      targetDirection: 'increase',
      bilateral,
      holdBased,
      tags: ['custom'],
    });
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a custom exercise"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            Add exercise
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-ink-soft leading-relaxed">
          For anything on your sheet that isn’t in the library. Write it down the way your therapist
          described it to you.
        </p>

        <Field label="Name" htmlFor="cx-name">
          <TextInput
            id="cx-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Seated shoulder press with band"
          />
        </Field>

        <Field label="Body area" htmlFor="cx-cat">
          <Select
            id="cx-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="What it is" htmlFor="cx-summary">
          <TextInput
            id="cx-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One line, in your own words"
          />
        </Field>

        <Field label="Steps" hint="One per line." htmlFor="cx-steps">
          <TextArea
            id="cx-steps"
            rows={4}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder={'Sit tall with the band under both feet\nPress up until the elbows straighten\nLower slowly'}
          />
        </Field>

        <Field
          label="Track with the camera"
          hint="Optional. Pick the joint angle that best matches the movement — or leave it as manual logging."
          htmlFor="cx-metric"
        >
          <Select
            id="cx-metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricId | '')}
          >
            <option value="">Manual logging only</option>
            {METRIC_LIST.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>

        {metric ? (
          <Field label="Default target" hint="In degrees or percent, matching the measure above.">
            <TextInput
              type="number"
              inputMode="numeric"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={String(metricOf(metric)?.suggestedTarget ?? 90)}
            />
          </Field>
        ) : null}

        <div className="rounded-xl border border-line bg-surface-2 p-4 space-y-2">
          <Toggle
            checked={bilateral}
            onChange={setBilateral}
            label="Done one side at a time"
            hint="Turn off for exercises that always use both sides together."
          />
          <Toggle
            checked={holdBased}
            onChange={setHoldBased}
            label="Held rather than repeated"
            hint="Stretches, balance holds, and anything counted in seconds."
          />
        </div>
      </div>
    </Modal>
  );
}
