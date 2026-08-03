/**
 * Charts. Range of motion over time, adherence, and how you have been feeling.
 *
 * Every chart of a camera-derived number carries the estimate caveat next to it
 * rather than once at the top of the page, because a chart is exactly the thing
 * that gets screenshotted and sent to someone out of context.
 */
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FileDown, LineChart as LineChartIcon, Printer, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  EstimateNote,
  SectionHeading,
  Segmented,
  Select,
  StatTile,
  cx,
} from '../components/ui';
import { statsForRange, summarise } from '../lib/adherence';
import { deleteSession } from '../lib/db';
import { formatDay, formatDuration, friendlyDay, lastNDays } from '../lib/dates';
import { metricOf } from '../lib/metrics';
import { downloadSummary, openSummary } from '../lib/ptSummary';
import type { SessionLog } from '../lib/types';
import { useStore } from '../state/store';

type Window = '30' | '90' | 'all';

export function ProgressPage() {
  const { sessions, prescriptions, activePrescriptions, exerciseById, readings, settings } =
    useStore();
  const [window, setWindow] = useState<Window>('30');

  const windowDays = window === 'all' ? 3650 : Number(window);
  const days = useMemo(() => lastNDays(Math.min(windowDays, 365)), [windowDays]);
  const windowSet = useMemo(() => new Set(days), [days]);
  const inWindow = useMemo(
    () => (window === 'all' ? sessions : sessions.filter((s) => windowSet.has(s.day))),
    [sessions, windowSet, window],
  );

  const summary = useMemo(
    () => summarise(activePrescriptions, sessions, Math.min(windowDays, 365)),
    [activePrescriptions, sessions, windowDays],
  );

  const adherenceData = useMemo(() => {
    const stats = statsForRange(activePrescriptions, sessions, days);
    return stats.map((s) => ({
      day: s.day,
      label: formatDay(s.day, { weekday: undefined }),
      pct: s.completion == null ? null : Math.round(s.completion * 100),
      logged: s.logged,
    }));
  }, [activePrescriptions, sessions, days]);

  // Every exercise+metric pairing that has camera data, newest activity first.
  const trackedSeries = useMemo(() => {
    const groups = new Map<string, SessionLog[]>();
    for (const s of inWindow) {
      if (s.source !== 'tracked' || !s.metric || s.peakValue == null) continue;
      const key = `${s.exerciseId}|${s.metric}|${s.side}`;
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()]
      .map(([key, list]) => ({ key, list: [...list].sort((a, b) => a.startedAt - b.startedAt) }))
      .sort((a, b) => b.list[b.list.length - 1].startedAt - a.list[a.list.length - 1].startedAt);
  }, [inWindow]);

  const [selectedSeries, setSelectedSeries] = useState<string>('');
  const activeSeries =
    trackedSeries.find((g) => g.key === selectedSeries) ?? trackedSeries[0] ?? null;

  const symptomData = useMemo(
    () =>
      inWindow
        .filter((s) => s.pain != null || s.fatigue != null)
        .sort((a, b) => a.startedAt - b.startedAt)
        .map((s) => ({
          label: formatDay(s.day, { weekday: undefined }),
          pain: s.pain ?? null,
          fatigue: s.fatigue ?? null,
        })),
    [inWindow],
  );

  const summaryInput = {
    settings,
    exercises: exerciseById,
    prescriptions,
    sessions,
    readings,
    windowDays: Math.min(windowDays, 365),
  };

  return (
    <>
      <PageHeader
        title="Progress"
        subtitle="How much you have done, and which way the numbers are moving."
        action={
          <div className="flex gap-2">
            <Button
              icon={<FileDown size={16} />}
              onClick={() => downloadSummary(summaryInput)}
            >
              Save summary
            </Button>
            <Button
              variant="primary"
              icon={<Printer size={16} />}
              onClick={() => {
                if (!openSummary(summaryInput)) {
                  alert('Your browser blocked the new tab. Use “Save summary” instead.');
                }
              }}
            >
              Summary for my PT
            </Button>
          </div>
        }
      />

      <div className="max-w-xs mb-6">
        <Segmented
          label="Time range"
          value={window}
          onChange={setWindow}
          options={[
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      {sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LineChartIcon size={30} />}
            title="No sessions logged yet"
            body="Once you have logged a few sessions — by hand or with the camera — your trends will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Sessions" value={inWindow.length} sub="in this period" />
            <StatTile
              label="Days active"
              value={`${summary.daysActive}`}
              sub={`of ${Math.min(windowDays, 365)}`}
            />
            <StatTile
              label="Of prescribed"
              value={summary.rate == null ? '—' : `${Math.round(summary.rate * 100)}%`}
              tone="brand"
            />
            <StatTile label="Streak" value={summary.streak} sub="days in a row" tone="accent" />
          </div>

          {/* --- range of motion --- */}
          <section>
            <SectionHeading
              title="Range of motion"
              hint="Best value reached in each camera session."
              action={
                trackedSeries.length > 1 ? (
                  <Select
                    aria-label="Choose a measurement"
                    value={activeSeries?.key ?? ''}
                    onChange={(e) => setSelectedSeries(e.target.value)}
                    className="!w-auto max-w-64"
                  >
                    {trackedSeries.map((g) => {
                      const [exerciseId, metricId, side] = g.key.split('|');
                      return (
                        <option key={g.key} value={g.key}>
                          {exerciseById.get(exerciseId)?.name ?? '—'} ·{' '}
                          {metricOf(metricId as never)?.short ?? metricId}
                          {side !== 'both' ? ` (${side})` : ''}
                        </option>
                      );
                    })}
                  </Select>
                ) : null
              }
            />
            {activeSeries ? (
              <RomChart seriesKey={activeSeries.key} sessions={activeSeries.list} />
            ) : (
              <Card>
                <EmptyState
                  title="No camera sessions yet"
                  body="Record a session on the Motion page and the trend line will start here."
                />
              </Card>
            )}
          </section>

          {/* --- adherence --- */}
          <section>
            <SectionHeading
              title="Keeping to the program"
              hint="Each bar is one day. Grey means nothing was scheduled."
            />
            <Card>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={adherenceData} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
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
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
                      axisLine={false}
                      tickLine={false}
                      unit="%"
                    />
                    <Tooltip content={<ChartTooltip suffix="% of the day’s plan" />} />
                    <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={22}>
                      {adherenceData.map((d, i) => (
                        <Cell
                          key={i}
                          fill={
                            d.pct == null
                              ? 'var(--border)'
                              : d.pct >= 100
                                ? 'var(--ok)'
                                : d.pct > 0
                                  ? 'var(--brand)'
                                  : 'var(--surface-2)'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </section>

          {/* --- pain & fatigue --- */}
          {symptomData.length > 1 ? (
            <section>
              <SectionHeading
                title="Pain and fatigue"
                hint="Your own 0–10 ratings, session by session. Only sessions you rated appear."
              />
              <Card>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={symptomData} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
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
                        domain={[0, 10]}
                        tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="pain"
                        name="Pain"
                        stroke="var(--danger)"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="fatigue"
                        name="Fatigue"
                        stroke="var(--accent)"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-4 mt-3 text-xs text-ink-soft">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 rounded bg-[var(--danger)]" /> Pain
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 rounded bg-[var(--accent)]" /> Fatigue
                  </span>
                </div>
              </Card>
            </section>
          ) : null}

          {/* --- history --- */}
          <section>
            <SectionHeading title="Session history" hint={`${inWindow.length} entries`} />
            <Card className="!p-0 divide-y divide-[var(--border)]">
              {inWindow.slice(0, 60).map((s) => {
                const metric = metricOf(s.metric);
                return (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 grow">
                      <p className="text-sm font-medium truncate">
                        {exerciseById.get(s.exerciseId)?.name ?? 'Removed exercise'}
                      </p>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {friendlyDay(s.day)} ·{' '}
                        {s.holdSecondsTotal
                          ? `${Math.round(s.holdSecondsTotal)}s held`
                          : `${s.setsCompleted} × ${s.repsCompleted}`}
                        {s.side !== 'both' ? ` · ${s.side}` : ''}
                        {s.durationSeconds ? ` · ${formatDuration(s.durationSeconds)}` : ''}
                        {s.pain != null ? ` · pain ${s.pain}/10` : ''}
                      </p>
                    </div>
                    {s.source === 'tracked' ? (
                      <Chip tone={s.reachedTarget ? 'ok' : 'neutral'}>
                        {s.peakValue != null ? Math.round(s.peakValue) : '—'}
                        {metric?.unit ?? ''}
                      </Chip>
                    ) : (
                      <Chip>manual</Chip>
                    )}
                    <button
                      type="button"
                      aria-label="Delete this session"
                      onClick={() => {
                        if (confirm('Delete this session from your log?')) deleteSession(s.id);
                      }}
                      className="text-ink-faint hover:text-danger p-2 -m-1 rounded-lg shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
              {inWindow.length > 60 ? (
                <p className="px-4 py-3 text-xs text-ink-faint">
                  Showing the 60 most recent. Export your data to see everything.
                </p>
              ) : null}
            </Card>
          </section>
        </div>
      )}
    </>
  );
}

function RomChart({ seriesKey, sessions }: { seriesKey: string; sessions: SessionLog[] }) {
  const { exerciseById } = useStore();
  const [, metricId, side] = seriesKey.split('|');
  const metric = metricOf(metricId as never);
  const exercise = exerciseById.get(seriesKey.split('|')[0]);
  const target = sessions[sessions.length - 1]?.targetValue;
  const direction = exercise?.targetDirection ?? 'increase';

  const data = sessions.map((s) => ({
    label: formatDay(s.day, { weekday: undefined }),
    best: s.peakValue == null ? null : Math.round(s.peakValue),
    reps: s.repsCompleted,
    hit: s.reachedTarget,
  }));

  const values = data.map((d) => d.best).filter((v): v is number => v != null);
  const first = values[0];
  const latest = values[values.length - 1];
  const delta = values.length > 1 ? latest - first : null;
  const best = values.length ? (direction === 'increase' ? Math.max(...values) : Math.min(...values)) : null;
  const improving = delta == null ? null : direction === 'increase' ? delta > 0 : delta < 0;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-faint">Latest</p>
          <p className="text-2xl font-semibold tabular">
            {latest ?? '—'}
            {metric?.unit}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-faint">Best</p>
          <p className="text-2xl font-semibold tabular">
            {best ?? '—'}
            {metric?.unit}
          </p>
        </div>
        {delta != null && Math.abs(delta) >= 1 ? (
          <Chip tone={improving ? 'ok' : 'neutral'}>
            {delta > 0 ? '+' : ''}
            {delta}
            {metric?.unit} since the first session here
          </Chip>
        ) : (
          <Chip>not enough sessions to call a trend</Chip>
        )}
        {side !== 'both' ? <Chip>{side} side</Chip> : null}
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="romFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
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
              domain={metric ? [metric.range[0], metric.range[1]] : ['auto', 'auto']}
              tick={{ fontSize: 11, fill: 'var(--ink-faint)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip suffix={metric?.unit} />} />
            {target != null ? (
              <ReferenceLine
                y={target}
                stroke="var(--accent)"
                strokeDasharray="6 5"
                strokeWidth={2}
                label={{
                  value: `target ${target}${metric?.unit ?? ''}`,
                  position: 'insideTopRight',
                  fill: 'var(--accent-ink)',
                  fontSize: 11,
                }}
              />
            ) : null}
            <Area
              type="monotone"
              dataKey="best"
              name="Best"
              stroke="var(--brand)"
              strokeWidth={2.5}
              fill="url(#romFill)"
              dot={{ r: 3.5, strokeWidth: 0, fill: 'var(--brand)' }}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <EstimateNote className="mt-3" />
    </Card>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  suffix = '',
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | null; color?: string }[];
  label?: string;
  suffix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className={cx('tabular', 'text-ink-soft')}>
          {entry.name ? `${entry.name}: ` : ''}
          <span className="text-ink font-semibold">
            {entry.value ?? '—'}
            {entry.value == null ? '' : suffix}
          </span>
        </p>
      ))}
    </div>
  );
}
