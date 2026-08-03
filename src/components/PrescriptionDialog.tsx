/**
 * Recording what the therapist actually prescribed.
 *
 * The wording throughout is "what were you told to do" rather than "choose a
 * plan", because the app must never look like it is the one deciding dose.
 */
import { useEffect, useState } from 'react';
import { createPrescription, putPrescription } from '../lib/db';
import { WEEKDAY_INITIALS } from '../lib/dates';
import type { Exercise, Prescription, Side } from '../lib/types';
import { metricOf } from '../lib/metrics';
import {
  Button,
  Field,
  Modal,
  NumberStepper,
  Segmented,
  Select,
  TextArea,
  TextInput,
  Toggle,
  cx,
} from './ui';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function PrescriptionDialog({
  open,
  onClose,
  exercises,
  editing,
  presetExerciseId,
  defaultSide,
}: {
  open: boolean;
  onClose: () => void;
  exercises: Exercise[];
  editing?: Prescription;
  presetExerciseId?: string;
  defaultSide?: Side;
}) {
  const [exerciseId, setExerciseId] = useState('');
  const [side, setSide] = useState<Side>('both');
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [useHold, setUseHold] = useState(false);
  const [holdSeconds, setHoldSeconds] = useState(20);
  const [timesPerDay, setTimesPerDay] = useState(2);
  const [days, setDays] = useState<number[]>(ALL_DAYS);
  const [targetValue, setTargetValue] = useState<string>('');
  const [prescribedBy, setPrescribedBy] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    const first = presetExerciseId ?? editing?.exerciseId ?? exercises[0]?.id ?? '';
    setExerciseId(first);
    setSide(editing?.side ?? defaultSide ?? 'both');
    setSets(editing?.sets ?? 3);
    setReps(editing?.reps ?? 10);
    setUseHold(!!editing?.holdSeconds);
    setHoldSeconds(editing?.holdSeconds ?? 20);
    setTimesPerDay(editing?.timesPerDay ?? 2);
    setDays(editing?.daysOfWeek?.length ? editing.daysOfWeek : ALL_DAYS);
    setTargetValue(editing?.targetValue != null ? String(editing.targetValue) : '');
    setPrescribedBy(editing?.prescribedBy ?? '');
    setNotes(editing?.notes ?? '');
  }, [open, editing, presetExerciseId, defaultSide, exercises]);

  const exercise = exercises.find((e) => e.id === exerciseId);
  const metric = metricOf(exercise?.metric);

  useEffect(() => {
    if (open && exercise?.holdBased) setUseHold(true);
  }, [open, exercise]);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const save = async () => {
    if (!exerciseId) return;
    const payload = {
      exerciseId,
      side,
      sets,
      reps,
      holdSeconds: useHold ? holdSeconds : undefined,
      timesPerDay,
      daysOfWeek: days.length ? days : ALL_DAYS,
      targetValue: targetValue.trim() ? Number(targetValue) : undefined,
      prescribedBy: prescribedBy.trim() || undefined,
      notes: notes.trim() || undefined,
      active: editing?.active ?? true,
    };
    if (editing) {
      await putPrescription({ ...editing, ...payload });
    } else {
      await createPrescription(payload);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit prescription' : 'Add to my program'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!exerciseId}>
            {editing ? 'Save changes' : 'Add to program'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-ink-soft rounded-xl bg-accent-soft border border-accent/30 px-3.5 py-3 leading-relaxed">
          Enter what your therapist told you to do. Rehabit has no opinion about the right dose and
          will not suggest one.
        </p>

        <Field label="Exercise" htmlFor="rx-exercise">
          <Select
            id="rx-exercise"
            value={exerciseId}
            onChange={(e) => setExerciseId(e.target.value)}
            disabled={!!editing}
          >
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>

        {exercise?.bilateral ? (
          <Field label="Which side" hint="Pick one side if only one was prescribed.">
            <Segmented
              label="Side"
              value={side}
              onChange={setSide}
              options={[
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
                { value: 'both', label: 'Both' },
              ]}
            />
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Sets">
            <NumberStepper label="sets" value={sets} onChange={setSets} min={1} max={20} />
          </Field>
          <Field label="Reps per set">
            <NumberStepper
              label="reps"
              value={reps}
              onChange={setReps}
              min={1}
              max={100}
              // Hold-based work still records a rep count of 1 per set.
            />
          </Field>
        </div>

        <div className="rounded-xl border border-line bg-surface-2 p-4 space-y-3">
          <Toggle
            checked={useHold}
            onChange={setUseHold}
            label="Hold each rep"
            hint="For stretches, balance holds, and anything you were told to hold for a count."
          />
          {useHold ? (
            <Field label="Hold for">
              <NumberStepper
                label="hold seconds"
                value={holdSeconds}
                onChange={setHoldSeconds}
                min={1}
                max={600}
                step={5}
                suffix="s"
              />
            </Field>
          ) : null}
        </div>

        <Field label="Times a day">
          <NumberStepper
            label="times per day"
            value={timesPerDay}
            onChange={setTimesPerDay}
            min={1}
            max={12}
          />
        </Field>

        <Field label="Which days" hint="Tap to include or exclude a day.">
          <div className="flex gap-1.5">
            {ALL_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                aria-pressed={days.includes(d)}
                aria-label={`Day ${d}`}
                className={cx(
                  'flex-1 rounded-xl border py-2.5 text-sm font-medium transition min-h-11',
                  days.includes(d)
                    ? 'bg-brand-soft border-brand/35 text-brand-ink'
                    : 'bg-surface border-line-strong text-ink-faint',
                )}
              >
                {WEEKDAY_INITIALS[d]}
              </button>
            ))}
          </div>
        </Field>

        {metric ? (
          <Field
            label={`Range-of-motion goal (${metric.short}, ${metric.unit})`}
            hint={`Leave blank to use the default of ${exercise?.defaultTarget ?? metric.suggestedTarget}${metric.unit}. Only fill this in if you were given a number.`}
          >
            <TextInput
              type="number"
              inputMode="numeric"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder={String(exercise?.defaultTarget ?? metric.suggestedTarget)}
            />
          </Field>
        ) : null}

        <Field label="Prescribed by" hint="Optional — appears on the summary you can print.">
          <TextInput
            value={prescribedBy}
            onChange={(e) => setPrescribedBy(e.target.value)}
            placeholder="e.g. Dana R., physiotherapist"
          />
        </Field>

        <Field label="Their instructions">
          <TextArea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything specific they said — how far to go, what to avoid, when to progress."
          />
        </Field>
      </div>
    </Modal>
  );
}
