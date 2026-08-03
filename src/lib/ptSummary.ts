/**
 * Builds the one-page summary a patient can print or email to their therapist.
 *
 * Written for the clinician who will spend ninety seconds on it: what was
 * prescribed, what was actually done, which way the numbers are moving, and — in
 * a box they cannot miss — how those numbers were obtained and why they should
 * not be treated as measurements. Self-contained HTML with inline styles so it
 * survives being saved, mailed, or opened on a hospital computer.
 */
import { formatDay, lastNDays, today, weekdayOf } from './dates';
import { metricOf } from './metrics';
import { statsForRange } from './adherence';
import type { Exercise, MetricReading, Prescription, SessionLog, Settings } from './types';

export interface SummaryInput {
  settings: Settings;
  exercises: Map<string, Exercise>;
  prescriptions: Prescription[];
  sessions: SessionLog[];
  readings: MetricReading[];
  windowDays: number;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function trendFor(values: { day: string; value: number }[]): string {
  if (values.length < 3) return 'not enough sessions yet';
  const half = Math.floor(values.length / 2);
  const mean = (arr: typeof values) => arr.reduce((n, v) => n + v.value, 0) / (arr.length || 1);
  const first = mean(values.slice(0, half));
  const last = mean(values.slice(-half));
  const delta = last - first;
  if (Math.abs(delta) < 3) return 'roughly unchanged';
  return `${delta > 0 ? 'up' : 'down'} about ${Math.abs(Math.round(delta))} on average`;
}

export function buildSummaryHtml(input: SummaryInput): string {
  const { settings, exercises, prescriptions, sessions, readings, windowDays } = input;
  const days = lastNDays(windowDays);
  const windowSet = new Set(days);
  const inWindow = sessions.filter((s) => windowSet.has(s.day));
  const stats = statsForRange(prescriptions, sessions, days);
  const due = stats.reduce((n, s) => n + s.due, 0);
  const done = stats.reduce((n, s) => n + s.done, 0);
  const activeDays = stats.filter((s) => s.logged > 0).length;

  const name = settings.displayName ? escape(settings.displayName) : 'Rehabit user';
  const period = `${formatDay(days[0], { year: 'numeric' })} – ${formatDay(today(), { year: 'numeric' })}`;

  const rxRows = prescriptions
    .filter((rx) => rx.active)
    .map((rx) => {
      const exercise = exercises.get(rx.exerciseId);
      const mine = inWindow.filter((s) => s.prescriptionId === rx.id);
      const expected =
        days.filter((d) => (rx.daysOfWeek.length ? rx.daysOfWeek.includes(weekdayOf(d)) : true))
          .length * rx.timesPerDay;
      return `<tr>
        <td><strong>${escape(exercise?.name ?? 'Removed exercise')}</strong>${
          rx.side !== 'both' ? `<br><span class="muted">${rx.side} side</span>` : ''
        }</td>
        <td>${rx.sets} × ${rx.reps}${rx.holdSeconds ? `, ${rx.holdSeconds}s hold` : ''}<br><span class="muted">${rx.timesPerDay}× a day</span></td>
        <td class="num">${mine.length}${expected ? ` / ${expected}` : ''}</td>
        <td>${escape(rx.notes ?? '—')}</td>
      </tr>`;
    })
    .join('');

  // ROM trends, one row per exercise+metric actually tracked in the window.
  const trackedGroups = new Map<string, SessionLog[]>();
  for (const s of inWindow) {
    if (s.source !== 'tracked' || !s.metric || s.peakValue == null) continue;
    const key = `${s.exerciseId}|${s.metric}|${s.side}`;
    trackedGroups.set(key, [...(trackedGroups.get(key) ?? []), s]);
  }

  const romRows = [...trackedGroups.entries()]
    .map(([key, group]) => {
      const [exerciseId, metricId, side] = key.split('|');
      const metric = metricOf(metricId as never);
      const exercise = exercises.get(exerciseId);
      const ordered = [...group].sort((a, b) => a.startedAt - b.startedAt);
      const points = ordered.map((s) => ({ day: s.day, value: s.peakValue! }));
      const best = Math.max(...points.map((p) => p.value));
      const latest = points[points.length - 1];
      const hit = ordered.filter((s) => s.reachedTarget).length;
      return `<tr>
        <td><strong>${escape(exercise?.name ?? '—')}</strong>${side !== 'both' ? `<br><span class="muted">${side}</span>` : ''}</td>
        <td>${escape(metric?.label ?? metricId)}</td>
        <td class="num">${Math.round(latest.value)}${metric?.unit ?? ''}</td>
        <td class="num">${Math.round(best)}${metric?.unit ?? ''}</td>
        <td class="num">${ordered[0].targetValue ?? '—'}${ordered[0].targetValue != null ? (metric?.unit ?? '') : ''}</td>
        <td class="num">${hit}/${ordered.length}</td>
        <td>${trendFor(points)}</td>
      </tr>`;
    })
    .join('');

  const painValues = inWindow.filter((s) => s.pain != null).map((s) => s.pain!);
  const fatigueValues = inWindow.filter((s) => s.fatigue != null).map((s) => s.fatigue!);
  const avg = (arr: number[]) => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '—');

  const readingRows = readings
    .filter((r) => windowSet.has(r.day))
    .slice(0, 40)
    .map(
      (r) => `<tr>
        <td>${escape(formatDay(r.day))}</td>
        <td>${escape(r.label ?? r.kind.replace('-', ' '))}</td>
        <td>${r.side}</td>
        <td class="num">${r.value} ${escape(r.unit)}</td>
      </tr>`,
    )
    .join('');

  const noteRows = inWindow
    .filter((s) => s.notes)
    .slice(0, 25)
    .map(
      (s) => `<li><span class="muted">${escape(formatDay(s.day))} · ${escape(
        exercises.get(s.exerciseId)?.name ?? '—',
      )}</span><br>${escape(s.notes!)}</li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Rehabit summary — ${name}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #1a2b2e; background: #fff; margin: 0; padding: 40px 32px;
  }
  .sheet { max-width: 850px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 2px; letter-spacing: -0.01em; }
  h2 { font-size: 15px; margin: 30px 0 10px; text-transform: uppercase; letter-spacing: .06em; color: #4a6b6f; }
  .muted { color: #6b8386; }
  header { border-bottom: 2px solid #0f766e; padding-bottom: 14px; margin-bottom: 8px; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 13px; color: #4a6b6f; margin-top: 6px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0 4px; }
  .card { border: 1px solid #d8e5e3; border-radius: 10px; padding: 11px 13px; }
  .card .k { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: #6b8386; }
  .card .v { font-size: 21px; font-weight: 650; margin-top: 2px; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 13px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: #6b8386; border-bottom: 1px solid #d8e5e3; padding: 6px 8px; }
  td { padding: 8px; border-bottom: 1px solid #eef4f3; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .warn { border: 2px solid #b45309; background: #fffbeb; border-radius: 10px; padding: 14px 16px; margin: 26px 0 0; }
  .warn strong { display: block; margin-bottom: 5px; }
  ul.notes { list-style: none; padding: 0; margin: 6px 0 0; }
  ul.notes li { border-bottom: 1px solid #eef4f3; padding: 8px 0; font-size: 13px; }
  footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #d8e5e3; font-size: 11.5px; color: #6b8386; }
  .empty { color: #6b8386; font-style: italic; padding: 8px 0; }
  @media print { body { padding: 0; } h2 { break-after: avoid; } tr { break-inside: avoid; } .warn { break-inside: avoid; } }
</style>
</head>
<body>
<div class="sheet">
  <header>
    <h1>Home exercise summary — ${name}</h1>
    <div class="meta">
      <span>${escape(period)} (${windowDays} days)</span>
      ${settings.condition ? `<span>Condition: ${escape(settings.condition)}</span>` : ''}
      ${settings.affectedSide !== 'unspecified' ? `<span>Affected side: ${settings.affectedSide}</span>` : ''}
      ${settings.onsetDate ? `<span>Onset: ${escape(formatDay(settings.onsetDate, { year: 'numeric' }))}</span>` : ''}
      ${settings.ptName ? `<span>Therapist: ${escape(settings.ptName)}</span>` : ''}
      <span>Generated ${escape(formatDay(today(), { year: 'numeric' }))}</span>
    </div>
  </header>

  <div class="cards">
    <div class="card"><div class="k">Sessions logged</div><div class="v">${inWindow.length}</div></div>
    <div class="card"><div class="k">Days active</div><div class="v">${activeDays} / ${windowDays}</div></div>
    <div class="card"><div class="k">Of prescribed</div><div class="v">${due ? Math.round((done / due) * 100) + '%' : '—'}</div></div>
    <div class="card"><div class="k">Avg pain / fatigue</div><div class="v">${avg(painValues)} / ${avg(fatigueValues)}</div></div>
  </div>

  <h2>Prescribed program</h2>
  ${
    rxRows
      ? `<table><thead><tr><th>Exercise</th><th>Dose</th><th class="num">Done / expected</th><th>Their instructions</th></tr></thead><tbody>${rxRows}</tbody></table>`
      : '<p class="empty">No active prescriptions recorded.</p>'
  }

  <h2>Camera-estimated range of motion</h2>
  ${
    romRows
      ? `<table><thead><tr><th>Exercise</th><th>Measure</th><th class="num">Latest</th><th class="num">Best</th><th class="num">Goal</th><th class="num">Goal met</th><th>Trend</th></tr></thead><tbody>${romRows}</tbody></table>`
      : '<p class="empty">No camera-tracked sessions in this period.</p>'
  }

  <div class="warn">
    <strong>How these range-of-motion figures were produced — please read.</strong>
    They are estimated by a pose-estimation model from an ordinary webcam, in the patient's home,
    without calibration or a clinician present. They are angles measured on a two-dimensional image:
    camera placement, clothing, lighting, and movement toward or away from the lens all shift them,
    and the error can be substantial. They are <em>not</em> goniometry, they were not validated
    against any clinical standard, and they should not be used to make a clinical decision. What
    they can reasonably show is the direction of change in one person over time, with the camera in
    roughly the same place. Rehabit is a self-tracking notebook, not a medical device.
  </div>

  ${
    readingRows
      ? `<h2>Other measurements</h2><table><thead><tr><th>Date</th><th>Measure</th><th>Side</th><th class="num">Value</th></tr></thead><tbody>${readingRows}</tbody></table>`
      : ''
  }

  ${noteRows ? `<h2>Patient notes</h2><ul class="notes">${noteRows}</ul>` : ''}

  <footer>
    Produced by Rehabit, a local-first home exercise log. All data was stored on the patient's own
    computer; nothing was uploaded. Pain and fatigue are the patient's own 0–10 ratings and were
    optional, so blanks mean "not recorded" rather than zero.
  </footer>
</div>
</body>
</html>`;
}

/** Opens the summary in a new tab, ready to print or save as PDF. */
export function openSummary(input: SummaryInput): boolean {
  const html = buildSummaryHtml(input);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  // Give the tab time to load before releasing the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return !!win;
}

export function downloadSummary(input: SummaryInput, filename = 'rehabit-summary.html') {
  const blob = new Blob([buildSummaryHtml(input)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
