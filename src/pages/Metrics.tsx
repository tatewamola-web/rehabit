/**
 * Other measurements — grip strength, pinch, tremor, or anything you want to
 * track yourself.
 *
 * This is a deliberately generic time series rather than a grip-strength
 * feature. When a dynamometer or an IMU eventually feeds numbers in, it writes
 * rows here with `source: 'device'` and every chart below works unchanged.
 */
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Gauge, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Modal,
  SectionHeading,
  Segmented,
  Select,
  TextArea,
  TextInput,
} from '../components/ui';
import { deleteReading, saveReading, uid } from '../lib/db';
import { dayKey, formatDay, today } from '../lib/dates';
import type { ExtraMetricKind, MetricReading, Side } from '../lib/types';
import { useStore } from '../state/store';

const KIND_LABELS: Record<ExtraMetricKind, string> = {
  'grip-strength': 'Grip strength',
  'pinch-strength': 'Pinch strength',
  tremor: 'Tremor',
  custom: 'Something else',
};

const KIND_UNITS: Record<ExtraMetricKind, string[]> = {
  'grip-strength': ['kg', 'lb'],
  'pinch-strength': ['kg', 'lb'],
  tremor: ['mm', 'Hz', 'score'],
  custom: ['reps', 'seconds', 'cm', 'score'],
};

const SERIES_COLORS = ['var(--brand)', 'var(--accent)'];

export function MetricsPage() {
  const { readings, settings } = useStore();
  const [adding, setAdding] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, MetricReading[]>();
    for (const r of readings) {
      const key = `${r.kind}|${r.label ?? ''}`;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].map(([key, list]) => ({
      key,
      kind: key.split('|')[0] as ExtraMetricKind,
      label: key.split('|')[1],
      list: [...list].sort((a, b) => a.recordedAt - b.recordedAt),
    }));
  }, [readings]);

  return (
    <>
      <PageHeader
        title="Other measures"
        subtitle="Grip strength, tremor, or anything else you or your therapist track by number."
        action={
          <Button variant="primary" icon={<Plus size={17} />} onClick={() => setAdding(true)}>
            Add a reading
          </Button>
        }
      />

      {readings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Gauge size={30} />}
            title="No measurements yet"
            body="If you have a grip dynamometer, a pinch gauge, or a number your therapist takes at each visit, record it here and it will chart alongside everything else."
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add your first reading
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.key}>
              <SectionHeading
                title={group.label || KIND_LABELS[group.kind]}
                hint={`${group.list.length} reading${group.list.length === 1 ? '' : 's'}`}
              />
              <ReadingChart readings={group.list} />
            </section>
          ))}

          <section>
            <SectionHeading title="All readings" />
            <Card className="!p-0 divide-y divide-[var(--border)]">
              {readings.slice(0, 80).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 grow">
                    <p className="text-sm font-medium">
                      {r.label || KIND_LABELS[r.kind]}
                      {r.side !== 'both' ? (
                        <span className="text-ink-soft font-normal"> · {r.side}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-soft mt-0.5">
                      {formatDay(r.day)}
                      {r.notes ? ` · ${r.notes}` : ''}
                    </p>
                  </div>
                  <Chip tone="brand">
                    {r.value} {r.unit}
                  </Chip>
                  {r.source === 'device' ? <Chip>device</Chip> : null}
                  <button
                    type="button"
                    aria-label="Delete this reading"
                    onClick={() => deleteReading(r.id)}
                    className="text-ink-faint hover:text-danger p-2 -m-1 rounded-lg shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </Card>
          </section>
        </div>
      )}

      <p className="text-xs text-ink-faint mt-8 leading-relaxed max-w-2xl">
        These are numbers you enter yourself, so they are exactly as accurate as your device and
        your technique. Grip readings in particular move a lot with posture, elbow angle, and time
        of day — take them the same way every time if you want the trend to mean anything.
      </p>

      <AddReadingDialog
        open={adding}
        onClose={() => setAdding(false)}
        defaultUnit={settings.gripUnit}
        defaultSide={
          settings.affectedSide === 'unspecified' ? 'both' : (settings.affectedSide as Side)
        }
      />
    </>
  );
}

function ReadingChart({ readings }: { readings: MetricReading[] }) {
  const sides = [...new Set(readings.map((r) => r.side))];
  const byDay = new Map<string, Record<string, number | string>>();
  for (const r of readings) {
    const row = byDay.get(r.day) ?? { label: formatDay(r.day, { weekday: undefined }) };
    row[r.side] = r.value;
    byDay.set(r.day, row);
  }
  const data = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
  const unit = readings[readings.length - 1]?.unit ?? '';
  const latest = readings[readings.length - 1];
  const first = readings[0];
  const delta = readings.length > 1 ? latest.value - first.value : null;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-faint">Latest</p>
          <p className="text-2xl font-semibold tabular">
            {latest.value} {unit}
          </p>
        </div>
        {delta != null && delta !== 0 ? (
          <Chip tone={delta > 0 ? 'ok' : 'neutral'}>
            {delta > 0 ? '+' : ''}
            {Math.round(delta * 10) / 10} {unit} since the first reading
          </Chip>
        ) : null}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
              interval="preserveStartEnd"
              minTickGap={28}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '0.75rem',
                fontSize: 12,
              }}
            />
            {sides.map((side, i) => (
              <Line
                key={side}
                type="monotone"
                dataKey={side}
                name={side}
                stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {sides.length > 1 ? (
        <div className="flex gap-4 mt-3 text-xs text-ink-soft">
          {sides.map((side, i) => (
            <span key={side} className="flex items-center gap-1.5">
              <span
                className="w-3 h-0.5 rounded"
                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {side}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function AddReadingDialog({
  open,
  onClose,
  defaultUnit,
  defaultSide,
}: {
  open: boolean;
  onClose: () => void;
  defaultUnit: string;
  defaultSide: Side;
}) {
  const [kind, setKind] = useState<ExtraMetricKind>('grip-strength');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState(defaultUnit);
  const [side, setSide] = useState<Side>(defaultSide);
  const [day, setDay] = useState(today());
  const [notes, setNotes] = useState('');

  const save = async () => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    await saveReading({
      id: uid(),
      kind,
      label: kind === 'custom' ? label.trim() || 'Custom measure' : label.trim() || undefined,
      value: numeric,
      unit,
      side,
      day,
      recordedAt: new Date(`${day}T12:00:00`).getTime(),
      notes: notes.trim() || undefined,
      source: 'manual',
    });
    setValue('');
    setNotes('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a reading"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!value.trim()}>
            Save reading
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="What are you measuring" htmlFor="mr-kind">
          <Select
            id="mr-kind"
            value={kind}
            onChange={(e) => {
              const next = e.target.value as ExtraMetricKind;
              setKind(next);
              setUnit(KIND_UNITS[next][0]);
            }}
          >
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {kind === 'custom' ? (
          <Field label="Name it" htmlFor="mr-label">
            <TextInput
              id="mr-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Nine-hole peg test"
            />
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Value" htmlFor="mr-value">
            <TextInput
              id="mr-value"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Unit" htmlFor="mr-unit">
            <Select id="mr-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {KIND_UNITS[kind].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Side">
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

        <Field label="Date" htmlFor="mr-day">
          <TextInput
            id="mr-day"
            type="date"
            value={day}
            max={today()}
            onChange={(e) => setDay(e.target.value || dayKey())}
          />
        </Field>

        <Field label="Notes">
          <TextArea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Which device, what position, anything unusual…"
          />
        </Field>
      </div>
    </Modal>
  );
}
