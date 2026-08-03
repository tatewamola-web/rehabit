/**
 * Manual session logging.
 *
 * Pain and fatigue are opt-in rather than defaulted to a number: a slider that
 * starts at 0 quietly records "no pain" for everyone who ignores it, which
 * would poison the one chart a therapist is most likely to look at.
 */
import { useEffect, useState } from 'react';
import { uid, saveSession } from '../lib/db';
import { today } from '../lib/dates';
import type { Exercise, Prescription, SessionLog, Side } from '../lib/types';
import { Button, Field, Modal, NumberStepper, ScaleSlider, Segmented, TextArea } from './ui';

export function LogSessionDialog({
  open,
  onClose,
  exercise,
  prescription,
  defaultSide,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  exercise: Exercise | undefined;
  prescription?: Prescription;
  defaultSide?: Side;
  onSaved?: (session: SessionLog) => void;
}) {
  const [sets, setSets] = useState(1);
  const [reps, setReps] = useState(10);
  const [holdSeconds, setHoldSeconds] = useState(30);
  const [side, setSide] = useState<Side>('both');
  const [pain, setPain] = useState<number | undefined>(undefined);
  const [fatigue, setFatigue] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSets(prescription?.sets ?? 1);
    setReps(prescription?.reps ?? 10);
    setHoldSeconds(prescription?.holdSeconds ?? 30);
    setSide(prescription?.side ?? defaultSide ?? (exercise?.bilateral ? 'right' : 'both'));
    setPain(undefined);
    setFatigue(undefined);
    setNotes('');
  }, [open, prescription, defaultSide, exercise]);

  if (!exercise) return null;
  const holdBased = !!exercise.holdBased || !!prescription?.holdSeconds;

  const save = async () => {
    setSaving(true);
    const session: SessionLog = {
      id: uid(),
      prescriptionId: prescription?.id,
      exerciseId: exercise.id,
      day: today(),
      startedAt: Date.now(),
      side,
      source: 'manual',
      setsCompleted: sets,
      repsCompleted: holdBased ? 0 : reps,
      holdSecondsTotal: holdBased ? holdSeconds * sets : undefined,
      pain,
      fatigue,
      notes: notes.trim() || undefined,
    };
    await saveSession(session);
    setSaving(false);
    onSaved?.(session);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Log: ${exercise.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save to log'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {prescription ? (
          <p className="text-sm text-ink-soft rounded-xl bg-surface-2 border border-line px-3.5 py-2.5">
            Prescribed: {prescription.sets} × {prescription.reps}
            {prescription.holdSeconds ? `, ${prescription.holdSeconds}s hold` : ''} ·{' '}
            {prescription.timesPerDay}× a day
          </p>
        ) : null}

        {exercise.bilateral ? (
          <Field label="Which side">
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
          <Field label="Sets done">
            <NumberStepper label="sets" value={sets} onChange={setSets} min={0} max={20} />
          </Field>
          {holdBased ? (
            <Field label="Hold each set">
              <NumberStepper
                label="hold seconds"
                value={holdSeconds}
                onChange={setHoldSeconds}
                min={0}
                max={600}
                step={5}
                suffix="s"
              />
            </Field>
          ) : (
            <Field label="Reps per set">
              <NumberStepper label="reps" value={reps} onChange={setReps} min={0} max={100} />
            </Field>
          )}
        </div>

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
          <p className="text-xs text-ink-faint leading-relaxed">
            Optional, but these two are usually the most useful thing to show your therapist. Leave
            them blank rather than guessing.
          </p>
        </div>

        <Field label="Notes" hint="How it felt, what you changed, anything that got in the way.">
          <TextArea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Shoulder felt tight for the first few, easier after…"
          />
        </Field>
      </div>
    </Modal>
  );
}
