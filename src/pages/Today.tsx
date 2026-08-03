/**
 * The home screen: what is due today, what has been done, and one tap to do it.
 */
import { useMemo, useState } from 'react';
import { CalendarPlus, Check, ClipboardList, Flame, Plus, Trash2, Video } from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import { LogSessionDialog } from '../components/LogSessionDialog';
import { PrescriptionDialog } from '../components/PrescriptionDialog';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  SectionHeading,
  StatTile,
  cx,
} from '../components/ui';
import { dueOnDay, encouragement, statsForDay, summarise } from '../lib/adherence';
import { deleteSession } from '../lib/db';
import { formatTime, friendlyDay, today } from '../lib/dates';
import { metricOf } from '../lib/metrics';
import { navigate } from '../lib/router';
import type { Exercise, Prescription } from '../lib/types';
import { useStore } from '../state/store';

export function TodayPage() {
  const { exerciseById, exercises, activePrescriptions, prescriptions, sessions, settings } =
    useStore();
  const day = today();

  const [logTarget, setLogTarget] = useState<{ exercise?: Exercise; rx?: Prescription } | null>(
    null,
  );
  const [showRxDialog, setShowRxDialog] = useState(false);

  const due = useMemo(
    () => dueOnDay(activePrescriptions, sessions, day),
    [activePrescriptions, sessions, day],
  );
  const stats = useMemo(
    () => statsForDay(activePrescriptions, sessions, day),
    [activePrescriptions, sessions, day],
  );
  const summary = useMemo(
    () => summarise(activePrescriptions, sessions, 30),
    [activePrescriptions, sessions],
  );
  const todaysSessions = useMemo(
    () => sessions.filter((s) => s.day === day).sort((a, b) => b.startedAt - a.startedAt),
    [sessions, day],
  );

  const greeting = settings.displayName ? `Hello, ${settings.displayName}` : friendlyDay(day);

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={encouragement(stats.due, stats.done)}
        action={
          <Button icon={<Plus size={17} />} onClick={() => setShowRxDialog(true)}>
            Add to program
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <StatTile
          label="Showing up"
          value={
            <span className="inline-flex items-center gap-1.5">
              {summary.streak}
              <Flame size={18} className="text-accent" />
            </span>
          }
          sub={summary.streak === 1 ? 'day in a row' : 'days in a row'}
          tone="accent"
        />
        <StatTile
          label="Today"
          value={stats.due ? `${stats.done}/${stats.due}` : '—'}
          sub={stats.due ? 'sessions done' : 'nothing scheduled'}
          tone="brand"
        />
        <StatTile
          label="Last 30 days"
          value={summary.rate == null ? '—' : `${Math.round(summary.rate * 100)}%`}
          sub={`${summary.sessionsInWindow} sessions logged`}
        />
      </div>

      <SectionHeading
        title="Due today"
        hint={
          due.length
            ? 'Tap Log after each set, or use the camera to measure as you go.'
            : undefined
        }
      />

      {due.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList size={30} />}
            title={
              activePrescriptions.length ? 'Nothing scheduled today' : 'Your program is empty'
            }
            body={
              activePrescriptions.length
                ? 'A rest day is part of the plan. You can still log anything you do off-schedule below.'
                : 'Add the exercises your therapist gave you, with the sets, reps and frequency they asked for.'
            }
            action={
              <Button
                variant="primary"
                icon={<CalendarPlus size={17} />}
                onClick={() => setShowRxDialog(true)}
              >
                Add your first exercise
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {due.map((item) => {
            const exercise = exerciseById.get(item.prescription.exerciseId);
            const metric = metricOf(exercise?.metric);
            const complete = item.done >= item.target;
            return (
              <Card as="li" key={item.prescription.id} className="!p-0 overflow-hidden">
                <div className="p-4 sm:p-5 flex flex-wrap items-start gap-4">
                  <div
                    aria-hidden
                    className={cx(
                      'w-11 h-11 rounded-xl grid place-items-center shrink-0 border',
                      complete
                        ? 'bg-ok-soft border-ok/35 text-ok'
                        : 'bg-surface-2 border-line text-ink-faint',
                    )}
                  >
                    {complete ? <Check size={20} /> : <span className="text-sm font-semibold tabular">{item.done}/{item.target}</span>}
                  </div>

                  <div className="min-w-0 grow">
                    <p className="font-medium leading-snug">
                      {exercise?.name ?? 'Removed exercise'}
                    </p>
                    <p className="text-sm text-ink-soft mt-0.5">
                      {item.prescription.sets} × {item.prescription.reps}
                      {item.prescription.holdSeconds
                        ? `, hold ${item.prescription.holdSeconds}s`
                        : ''}{' '}
                      · {item.prescription.timesPerDay}× a day
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {item.prescription.side !== 'both' ? (
                        <Chip>{item.prescription.side} side</Chip>
                      ) : null}
                      {metric ? (
                        <Chip tone="brand">
                          target{' '}
                          {item.prescription.targetValue ??
                            exercise?.defaultTarget ??
                            metric.suggestedTarget}
                          {metric.unit} {metric.short.toLowerCase()}
                        </Chip>
                      ) : null}
                      {complete ? <Chip tone="ok">done for today</Chip> : null}
                    </div>
                    {item.prescription.notes ? (
                      <p className="text-sm text-ink-soft mt-2 italic">
                        “{item.prescription.notes}”
                      </p>
                    ) : null}
                  </div>

                  <div className="flex gap-2 w-full sm:w-auto">
                    {metric ? (
                      <Button
                        icon={<Video size={16} />}
                        onClick={() =>
                          navigate('/motion', {
                            exercise: exercise?.id,
                            rx: item.prescription.id,
                          })
                        }
                        className="grow sm:grow-0"
                      >
                        Camera
                      </Button>
                    ) : null}
                    <Button
                      variant="primary"
                      icon={<Check size={16} />}
                      onClick={() => setLogTarget({ exercise, rx: item.prescription })}
                      className="grow sm:grow-0"
                    >
                      Log
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </ul>
      )}

      <div className="mt-10">
        <SectionHeading
          title="Logged today"
          hint={todaysSessions.length ? undefined : 'Nothing yet.'}
        />
        {todaysSessions.length ? (
          <Card className="!p-0 divide-y divide-[var(--border)]">
            {todaysSessions.map((s) => {
              const exercise = exerciseById.get(s.exerciseId);
              const metric = metricOf(s.metric);
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 grow">
                    <p className="text-sm font-medium truncate">
                      {exercise?.name ?? 'Removed exercise'}
                    </p>
                    <p className="text-xs text-ink-soft mt-0.5">
                      {formatTime(s.startedAt)} ·{' '}
                      {s.holdSecondsTotal
                        ? `${Math.round(s.holdSecondsTotal)}s held`
                        : `${s.setsCompleted} × ${s.repsCompleted}`}
                      {s.side !== 'both' ? ` · ${s.side}` : ''}
                      {s.pain != null ? ` · pain ${s.pain}/10` : ''}
                    </p>
                  </div>
                  {s.source === 'tracked' && metric && s.peakValue != null ? (
                    <Chip tone={s.reachedTarget ? 'ok' : 'neutral'}>
                      {Math.round(s.peakValue)}
                      {metric.unit} best
                    </Chip>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Delete this entry"
                    onClick={() => deleteSession(s.id)}
                    className="text-ink-faint hover:text-danger p-2 -m-1 rounded-lg shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </Card>
        ) : (
          <Card>
            <EmptyState
              title="No sessions logged yet today"
              body="Anything you do counts — log it even if it was not on the schedule."
              action={
                exercises.length ? (
                  <Button
                    onClick={() => setLogTarget({ exercise: exercises[0] })}
                    icon={<Plus size={16} />}
                  >
                    Log something off-plan
                  </Button>
                ) : null
              }
            />
          </Card>
        )}
      </div>

      <LogSessionDialog
        open={!!logTarget}
        onClose={() => setLogTarget(null)}
        exercise={logTarget?.exercise}
        prescription={logTarget?.rx}
      />
      <PrescriptionDialog
        open={showRxDialog}
        onClose={() => setShowRxDialog(false)}
        exercises={exercises}
        defaultSide={
          settings.affectedSide === 'unspecified' ? undefined : settings.affectedSide
        }
      />
      {prescriptions.length > activePrescriptions.length ? (
        <p className="text-xs text-ink-faint mt-6">
          {prescriptions.length - activePrescriptions.length} paused prescription
          {prescriptions.length - activePrescriptions.length === 1 ? '' : 's'} — manage them under
          Exercises → My program.
        </p>
      ) : null}
    </>
  );
}
