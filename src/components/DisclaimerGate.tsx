/**
 * First-run gate. Not a toast, not a footnote — you cannot reach the app until
 * you have read this and ticked the box. Bumping DISCLAIMER_VERSION in db.ts
 * brings it back for everyone.
 */
import { useState } from 'react';
import { Activity, ShieldAlert } from 'lucide-react';
import { Button } from './ui';
import { DISCLAIMER_VERSION } from '../lib/db';
import { useStore } from '../state/store';

export function DisclaimerGate({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings, ready } = useStore();
  const [checked, setChecked] = useState(false);

  if (!ready) {
    return (
      <div className="min-h-dvh grid place-items-center bg-bg text-ink-soft">
        <div className="flex items-center gap-3 pulse-soft">
          <Activity size={20} />
          <span className="text-sm">Opening your local log…</span>
        </div>
      </div>
    );
  }

  if (settings.disclaimerAcceptedVersion === DISCLAIMER_VERSION) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-dvh bg-bg text-ink grid place-items-center p-4 sm:p-6">
      <div className="card max-w-2xl w-full p-6 sm:p-8 animate-in">
        <div className="flex items-center gap-3 mb-6">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="w-10 h-10 rounded-xl" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Rehabit</h1>
            <p className="text-sm text-ink-soft">Before you start, please read this.</p>
          </div>
        </div>

        <div className="rounded-xl border border-danger/35 bg-danger-soft p-4 sm:p-5 mb-5">
          <div className="flex gap-3">
            <ShieldAlert size={20} className="text-danger shrink-0 mt-0.5" />
            <div className="space-y-2.5 text-sm leading-relaxed">
              <p className="font-semibold text-ink">
                Rehabit is not a medical device and does not replace your therapist or doctor.
              </p>
              <p className="text-ink-soft">
                It is a notebook and a mirror: somewhere to record the exercises you were given, and
                a rough way to watch your movement change. It cannot examine you, it does not know
                your diagnosis, and it must not be used to decide what exercises to do, how hard to
                push, or whether something is healing.
              </p>
            </div>
          </div>
        </div>

        <ul className="space-y-3 text-sm leading-relaxed mb-6">
          <li className="flex gap-3">
            <span aria-hidden className="text-brand mt-0.5">
              •
            </span>
            <span>
              <strong className="font-medium">Follow your own program.</strong> The exercise list
              here is a convenience so you can find yours quickly. It is not a recommendation, and
              nothing in it was chosen for you or your condition.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-brand mt-0.5">
              •
            </span>
            <span>
              <strong className="font-medium">The angles are estimates.</strong> They come from a
              flat webcam image and are affected by where you stand, what you wear, and the light in
              the room. They can be out by a good many degrees. They are useful for comparing you to
              you over weeks — not for comparing yourself to anyone else, and not as a measurement
              anyone should act on clinically.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-brand mt-0.5">
              •
            </span>
            <span>
              <strong className="font-medium">Pain is a stop sign.</strong> Sharp, new, or
              increasing pain, or any new numbness or weakness, means stop and contact your
              clinician.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-danger mt-0.5">
              •
            </span>
            <span>
              <strong className="font-medium">Signs of a stroke are an emergency.</strong> Sudden
              face drooping, arm weakness, or speech difficulty — call emergency services
              immediately. Do not open this app, and do not wait to see if it passes.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-brand mt-0.5">
              •
            </span>
            <span>
              <strong className="font-medium">Your data stays here.</strong> Everything is stored on
              this computer, in this browser. Nothing is uploaded, and the camera image never leaves
              the page — it is analysed on your machine and thrown away frame by frame.
            </span>
          </li>
        </ul>

        <label className="flex items-start gap-3 rounded-xl border border-line-strong bg-surface-2 p-4 cursor-pointer mb-5">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-[var(--brand)] shrink-0"
          />
          <span className="text-sm leading-relaxed">
            I understand that Rehabit is not medical advice, that its measurements are rough
            estimates, and that I will follow the program my own therapist or doctor gave me.
          </span>
        </label>

        <Button
          variant="primary"
          size="lg"
          block
          disabled={!checked}
          onClick={() =>
            updateSettings({
              disclaimerAcceptedVersion: DISCLAIMER_VERSION,
              disclaimerAcceptedAt: Date.now(),
            })
          }
        >
          Start using Rehabit
        </Button>
      </div>
    </div>
  );
}
