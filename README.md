<div align="center">

<img src="public/icon.svg" width="72" height="72" alt="">

# Rehabit

**Log the exercises your physical therapist gave you, measure your range of motion with a webcam, and watch the trend over weeks — all on your own computer.**

Built for stroke survivors doing a home exercise program, and for anyone rehabbing an injury.

`local-first` · `no account` · `no server` · `works offline`

</div>

---

## ⚠️ Read this first

**Rehabit is not a medical device and is not a substitute for a physical therapist or doctor.**

It is a notebook and a mirror. It records what you were told to do and gives you a rough way to
watch your movement change. It cannot examine you, it does not know your diagnosis, and it must
never be used to decide what exercises to do, how hard to push, or whether something is healing.

The angle measurements come from an ordinary webcam. They are angles measured on a flat image, and
they shift with camera placement, clothing, lighting, and movement toward or away from the lens —
**the error can be substantial.** They are useful for comparing *you today* against *you last week*
with the camera in roughly the same place. They are not goniometry, they have not been validated
against any clinical standard, and no clinical decision should rest on them.

New or worsening pain, numbness, or weakness means stop and contact your clinician. **Sudden face
drooping, arm weakness, or speech difficulty is a medical emergency — call emergency services.**

The app makes you read a version of this before it will open, and repeats the estimate caveat next
to every number it produces. The full version is in [DISCLAIMER.md](DISCLAIMER.md).

---

## What it does

### Task log
Record the exercise, sets, reps, hold time, and how many times a day your therapist actually asked
for — then check it off as you go, with an optional 0–10 pain and fatigue rating and a note per
session. A library of **50 common rehab movements** ships with the app (shoulder, elbow, hand and
wrist, hip and knee, ankle, trunk, balance, and everyday tasks), each with plain-language steps,
form cues, and safety notes. Anything not in the library can be added as a custom exercise.

Adherence is tracked as a streak, a completion rate, and a per-day chart — framed supportively.
A day with nothing scheduled doesn't break a streak, and a partly-finished day still counts.

### Webcam motion analyst
On-device pose tracking draws a live skeleton over your camera feed, **including all 21 landmarks
per hand** so you can see exactly which fingers are being detected. Turn on landmark labels to
check the tracking is finding the right parts of you.

- **Live joint angle** with the target drawn as a dashed "ghost limb" you can move toward
- **Automatic rep counting** that adapts to the range you actually have today, rather than only
  counting reps that reach the prescribed target — so a session always gives you a number
- **Session recording**: the angle trace, per-rep peaks, best value, and whether you reached target
- **Honest failure**: it tells you when it can't see you properly instead of logging nonsense, and
  flags sessions where tracking was poor

Sixteen measurements are supported, including elbow flexion, shoulder flexion and abduction, knee
and hip flexion, hip abduction, trunk lean, wrist bend, fist closing and opening, knuckle flexion,
thumb opposition, finger spread, and pinch aperture.

### Progress dashboard
Range of motion over time per exercise per side, with your goal as a reference line. Adherence per
day. Pain and fatigue trends. Plus a **printable one-page summary for your therapist** — what was
prescribed, what was done, the ROM trend, your notes, and a prominent explanation of how those
numbers were obtained and why they aren't measurements.

### Other measures
A generic time series for grip strength, pinch strength, tremor, or anything else you count. Charts
alongside everything else. Built so a dynamometer or IMU integration later only has to write rows.

---

## Privacy

There is no server. There is no account. There is no analytics, no telemetry, and no network call
after install.

- All your data lives in **IndexedDB in your browser, on your machine**.
- The camera image is analyzed **frame by frame in WebAssembly inside the tab** and discarded
  immediately. No video is recorded, saved, or transmitted. Only numbers are stored, and only when
  you press record.
- Pose models and the MediaPipe runtime are vendored into the app's own folder at setup, so after
  installing you can **unplug the network entirely** and everything still works.

The flip side: your log is only as safe as that browser profile. Clearing site data will erase it,
and a different browser is a different, empty log. Settings has a one-click JSON export of
everything — use it.

---

## Running it

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/tatewamola-web/rehabit.git
```

```bash
cd rehabit && npm install
```

`npm install` also downloads the pose models (~22 MB) and copies the MediaPipe WASM runtime into
`public/`. If that step fails because you were offline, run it again later:

```bash
npm run setup
```

Then start it:

```bash
npm run dev
```

Open <http://localhost:5273>. Chrome, Edge, or Safari on a reasonably recent machine; the camera
needs `localhost` or HTTPS, which `npm run dev` gives you.

To build a static copy you can serve from anywhere (or open from a folder — it uses hash routing):

```bash
npm run build
```

### Tips for better tracking

- Stand where the exercise's chip tells you to — *side-on* for flexion measurements, *facing the
  camera* for abduction and side bending. The app shows this per exercise.
- Get the whole limb in frame, and leave the camera in the same place between sessions.
- Plain background, light on you rather than behind you.
- Wear something that doesn't hide the joint. Loose trousers move the knee point around.
- If the video stutters, Settings → Camera → *Fast* model.

---

## How it works

| | |
|---|---|
| UI | React 19 + TypeScript + Vite + Tailwind 4 |
| Pose | [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) — `PoseLandmarker` (33 body points) and `HandLandmarker` (21 points per hand), WASM/GPU, in-tab |
| Storage | IndexedDB via `idb` |
| Charts | Recharts |
| Backend | none |

Angles are computed from landmark triples in aspect-corrected 2D, smoothed with a
[1€ filter](https://gery.casiez.net/1euro/) so the readout is calm when you hold a position but
doesn't lag when you move. Reps come from a hysteresis state machine over your session's own
observed amplitude, with a minimum amplitude and minimum rep duration to reject tremor. Frames
where the model isn't confident about the joints a measurement needs are dropped rather than
guessed at, and the fraction of good frames is stored with the session.

Worth reading if you want the design reasoning: [`docs/BRIEF.md`](docs/BRIEF.md).

```
src/
  lib/        angles, rep detection, smoothing, pose engine, canvas overlay, storage, exercises
  components/ shell, disclaimer gate, dialogs, UI primitives
  pages/      Today · Exercises · Motion · Progress · Measures · Settings
  state/      store provider, reminders
```

---

## Accessibility

Designed around someone working one-handed with reduced fine motor control, because that is who a
lot of this is for.

- Nothing interactive smaller than a comfortable target; visible focus everywhere
- Text scale control that resizes the whole interface, not just type
- Full keyboard operation, skip link, ARIA roles on custom controls
- Light and dark themes, both contrast-checked; `prefers-reduced-motion` respected
- No timed interactions, and no penalty anywhere for being slow

---

## Contributing

Issues and pull requests welcome — especially from therapists and from people actually doing rehab.

Two things that would help most:

1. **Exercise library coverage.** If something you were prescribed isn't in there, open an issue
   with the name and how it was described to you.
2. **Measurement honesty.** If a metric reads wrong in a way that isn't already documented in its
   `note` in `src/lib/metrics.ts`, that's a bug worth filing.

Please don't send PRs that add clinical claims, normative ranges, "you should do X" advice, or
anything that would make the app look like it's giving medical guidance. Keeping that line bright
is the point.

## License

MIT — see [LICENSE](LICENSE). Use of the software is also subject to the terms in
[DISCLAIMER.md](DISCLAIMER.md).

Rehabit is not affiliated with, endorsed by, or a product of any healthcare organization.
