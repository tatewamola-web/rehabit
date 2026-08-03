# Rehabit — Product Brief

> This is the sharpened version of the original feature list. It is the spec the
> code in this repo is built against.

## One-line

**Rehabit** is a local-first rehab companion that helps people rebuild movement
after a stroke or an injury: log the exercises their physical therapist actually
prescribed, use a webcam to see and measure their range of motion in real time,
and watch the trend line over weeks.

## Who it is for

- **Primary:** stroke survivors in the sub-acute and chronic phases doing a
  home exercise program between clinic visits, often with hemiparesis, reduced
  fine motor control, and fatigue.
- **Also:** anyone rehabbing an orthopedic injury (frozen shoulder, ACL, wrist
  fracture, post-op) who was handed a paper sheet of exercises.
- **Secondary reader:** their actual PT, who receives an exported summary.

The stroke focus shows up in the *defaults* — affected/unaffected side tracking,
mirror-therapy framing, fatigue logging, one-handed operation, large targets,
slow-movement-friendly rep detection — not in a separate mode. An ACL patient
uses the same screens.

## Non-negotiable framing

Rehabit is **not a medical device and not a substitute for a physical
therapist.** Webcam pose estimation is approximate. This must be:

1. Acknowledged once at first run (an actual gate, not a toast).
2. Visible on every screen that produces a number.
3. Restated on any export the patient might hand to a clinician.
4. Backed by honest accuracy language: angles are estimates from a 2D camera,
   sensitive to camera placement, clothing, and lighting; they are useful for
   **tracking change in yourself over time**, not for diagnosis or for comparing
   against a goniometer reading.

Plus a safety layer: stop-if-pain guidance, and stroke red-flag (FAST) info
surfaced where a user in trouble would plausibly look.

## Principles

| | |
|---|---|
| **Local-first** | All personal data stays in the browser's IndexedDB on the user's own machine. No account, no server, no telemetry, no analytics. Video never leaves the device — pose inference runs in WASM in the tab. |
| **Portable** | One-click export of everything to JSON, and a printable PT summary. Import restores it. The user owns the file. |
| **Accessible by default** | Operable one-handed; keyboard reachable; large hit targets; high contrast; `prefers-reduced-motion` respected; text scale control. A user with hemiparesis is the design center, not an edge case. |
| **Honest** | Never show a number more precise than the method deserves. Show confidence. Say "estimate". Fail loudly when tracking is bad rather than logging garbage. |
| **Calm** | Rehab is a grind. No streak-shaming, no red failure states, no gamified guilt. Missing a day is normal and the UI says so. |

## Feature scope

### 1. Task log — the prescription is the source of truth
- Exercise library ships with ~40 common rehab movements across upper limb,
  hand, lower limb, trunk, balance, and functional/ADL categories, each with
  cues, a plain-language description, and a safety note. Users add their own.
- A **prescription** wraps an exercise with what the PT actually said: sets,
  reps, hold time, times per day, which days, which side, free-text notes.
- **Today** view = the day's schedule, checkable per session, with per-entry
  pain (0–10), fatigue (0–10), and a notes field.
- Adherence: streak, 7/30-day completion rate, calendar heatmap. Framed
  supportively.

### 2. Motion analyst — webcam ROM measurement
- On-device **pose** (33 body landmarks) + **hand** (21 landmarks per hand)
  tracking, drawn as a live skeleton overlay so the user can *see* what is being
  detected, including individual fingers. This overlay doubles as the
  "is it tracking me correctly?" debug view.
- **Live joint angles** computed from landmark triples, smoothed, with the
  target ROM drawn as an arc and a live "elbow 94° → target 120°" readout.
- **Auto rep counting** via a hysteresis state machine (enter/exit thresholds +
  minimum hold + refractory), tuned so slow, effortful stroke-survivor reps
  still count and tremor does not double-count.
- **Session recording**: angle-over-time series, peak/min ROM, per-rep peaks,
  and a pass/fail against the target — saved to the same log as manual entries.
- Guidance when tracking is poor (out of frame, low confidence, bad lighting)
  instead of silently recording nonsense.

### 3. Progress dashboard
- ROM over time per joint per exercise, with the target as a reference line.
- Adherence over time, session counts, pain/fatigue trend.
- **PT summary export**: a clean, printable one-pager — what was prescribed,
  what was done, ROM trend, pain trend, and the accuracy disclaimer.

### 4. Extra metrics (the bolt-on path)
A generic time-series metric store so grip strength (kg/lbs, per side) and
tremor/IMU amplitude are *just another series* on the same dashboard. Manual
entry now; the store and charts are shaped so a device integration later only
has to write rows.

## Technical shape

- Vite + React + TypeScript, Tailwind for styling.
- MediaPipe Tasks Vision (`PoseLandmarker`, `HandLandmarker`) running in-browser
  via WASM/GPU. Model files and the WASM runtime are **vendored into the repo's
  public folder at setup time**, so after `npm run setup` the app runs with the
  network off.
- IndexedDB via `idb` for all user data. Recharts for charts.
- No backend. `npm run dev` and the browser is the whole stack.

## Discoverability

The user asked that people be able to find it. That means: a real name, a README
that explains the problem in the first paragraph, screenshots, a license, GitHub
topics (`stroke-rehabilitation`, `physical-therapy`, `pose-estimation`,
`mediapipe`, `range-of-motion`, `local-first`, `accessibility`), and a clear
"this is not medical advice" section up top so a clinician skimming it trusts it.

## Explicitly out of scope (for now)

Cloud sync, accounts, multi-user/clinician portals, EHR integration, any claim of
clinical validity, and mobile apps. Desktop browser, one person, one machine.
