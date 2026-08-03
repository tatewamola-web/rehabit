/**
 * Settings, and the place where the app is honest about what it is.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Download,
  HardDrive,
  Info,
  Palette,
  ShieldAlert,
  Trash2,
  Upload,
  User,
  Video,
} from 'lucide-react';
import { PageHeader } from '../components/AppShell';
import {
  Button,
  Card,
  Chip,
  Field,
  Modal,
  SectionHeading,
  Segmented,
  TextInput,
  Toggle,
  cx,
} from '../components/ui';
import { eraseEverything, estimateUsage, exportAll, importBundle } from '../lib/db';
import { today } from '../lib/dates';
import type { AffectedSide } from '../lib/types';
import { useStore } from '../state/store';

export function SettingsPage() {
  const { settings, updateSettings, sessions, prescriptions, exercises, readings } = useStore();
  const [usage, setUsage] = useState<{ usedBytes: number; quotaBytes: number } | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void estimateUsage().then(setUsage);
  }, [sessions.length, readings.length]);

  const doExport = async () => {
    const bundle = await exportAll();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rehabit-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text());
      const result = await importBundle(bundle, { restoreSettings: false });
      setImportMessage(
        `Restored ${result.sessions} sessions, ${result.prescriptions} prescriptions, ${result.exercises} exercises, and ${result.readings} readings.`,
      );
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : 'That file could not be read.');
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Your details, how it looks, and where your data lives." />

      <div className="space-y-8 max-w-2xl">
        {/* --- about you --- */}
        <section>
          <SectionHeading
            title="About you"
            hint="Only used to personalise the app and fill in the summary you print."
          />
          <Card className="space-y-5">
            <Field label="Name" htmlFor="st-name">
              <TextInput
                id="st-name"
                value={settings.displayName ?? ''}
                onChange={(e) => updateSettings({ displayName: e.target.value })}
                placeholder="What should the app call you?"
              />
            </Field>

            <Field
              label="Affected side"
              hint="Used to pre-select the right side when you log or track. You can always change it per session."
            >
              <Segmented
                label="Affected side"
                value={settings.affectedSide}
                onChange={(v) => updateSettings({ affectedSide: v as AffectedSide })}
                options={[
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                  { value: 'both', label: 'Both' },
                  { value: 'unspecified', label: 'N/A' },
                ]}
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Condition" htmlFor="st-cond" hint="Free text — appears on the summary.">
                <TextInput
                  id="st-cond"
                  value={settings.condition ?? ''}
                  onChange={(e) => updateSettings({ condition: e.target.value })}
                  placeholder="e.g. right MCA stroke, or ACL repair"
                />
              </Field>
              <Field label="Stroke or injury date" htmlFor="st-onset">
                <TextInput
                  id="st-onset"
                  type="date"
                  max={today()}
                  value={settings.onsetDate ?? ''}
                  onChange={(e) => updateSettings({ onsetDate: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Therapist" htmlFor="st-pt" hint="Named on the printable summary.">
              <TextInput
                id="st-pt"
                value={settings.ptName ?? ''}
                onChange={(e) => updateSettings({ ptName: e.target.value })}
                placeholder="e.g. Dana R., physiotherapist"
              />
            </Field>
          </Card>
        </section>

        {/* --- appearance --- */}
        <section>
          <SectionHeading title="Appearance" hint="Make it comfortable to read and to hit." />
          <Card className="space-y-5">
            <Field label="Theme">
              <Segmented
                label="Theme"
                value={settings.theme}
                onChange={(v) => updateSettings({ theme: v })}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </Field>
            <Field
              label="Text size"
              hint="Scales the whole interface, including buttons and tap targets."
            >
              <Segmented
                label="Text size"
                value={String(settings.textScale)}
                onChange={(v) => updateSettings({ textScale: Number(v) })}
                options={[
                  { value: '0.95', label: 'Small' },
                  { value: '1', label: 'Normal' },
                  { value: '1.15', label: 'Large' },
                  { value: '1.3', label: 'Largest' },
                ]}
              />
            </Field>
            <p className="text-xs text-ink-faint flex items-center gap-2">
              <Palette size={13} /> Reduced-motion is followed automatically from your system
              settings.
            </p>
          </Card>
        </section>

        {/* --- camera --- */}
        <section>
          <SectionHeading title="Camera" hint="How the Motion page behaves." />
          <Card className="space-y-4">
            <Toggle
              checked={settings.mirrorCamera}
              onChange={(v) => updateSettings({ mirrorCamera: v })}
              label="Mirror the picture"
              hint="On by default, so moving your right arm moves the arm on the right of the screen."
            />
            <Toggle
              checked={settings.showLandmarkNumbers}
              onChange={(v) => updateSettings({ showLandmarkNumbers: v })}
              label="Label every detected point"
              hint="Names each joint and fingertip on the overlay. Useful for checking the tracking is actually finding the right parts of you."
            />
            <Field
              label="Detection model"
              hint="Accurate uses noticeably more processor. If the video stutters, go back to fast."
            >
              <Segmented
                label="Detection model"
                value={settings.poseModel}
                onChange={(v) => updateSettings({ poseModel: v })}
                options={[
                  { value: 'lite', label: 'Fast' },
                  { value: 'full', label: 'Accurate' },
                ]}
              />
            </Field>
            <p className="text-xs text-ink-faint flex items-start gap-2 leading-relaxed">
              <Video size={13} className="mt-0.5 shrink-0" />
              The camera image is analysed on this computer and discarded frame by frame. No video is
              recorded, saved, or sent anywhere.
            </p>
          </Card>
        </section>

        {/* --- reminders --- */}
        <section>
          <SectionHeading title="Reminders" hint="Nudges while Rehabit is open in a tab." />
          <Card className="space-y-4">
            <Toggle
              checked={settings.remindersEnabled}
              onChange={async (v) => {
                if (v && 'Notification' in window && Notification.permission === 'default') {
                  await Notification.requestPermission();
                }
                updateSettings({ remindersEnabled: v });
              }}
              label="Remind me at set times"
              hint="A browser notification at each time below, if you haven't logged anything in the previous hour."
            />
            {settings.remindersEnabled ? (
              <Field label="Times" hint="Comma-separated, 24-hour clock.">
                <TextInput
                  value={settings.reminderTimes.join(', ')}
                  onChange={(e) =>
                    updateSettings({
                      reminderTimes: e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter((t) => /^\d{1,2}:\d{2}$/.test(t)),
                    })
                  }
                  placeholder="09:00, 14:00, 19:00"
                />
              </Field>
            ) : null}
            <p className="text-xs text-ink-faint flex items-start gap-2 leading-relaxed">
              <Bell size={13} className="mt-0.5 shrink-0" />
              Because everything runs locally with no server, reminders only fire while this page is
              open somewhere in your browser. For anything you must not miss, use your phone's own
              alarm as well.
            </p>
          </Card>
        </section>

        {/* --- data --- */}
        <section>
          <SectionHeading title="Your data" hint="All of it, on this computer, in this browser." />
          <Card className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                ['Sessions', sessions.length],
                ['Prescriptions', prescriptions.length],
                ['Exercises', exercises.length],
                ['Readings', readings.length],
              ].map(([label, count]) => (
                <div key={label} className="rounded-xl border border-line bg-surface-2 py-3">
                  <p className="text-xl font-semibold tabular">{count}</p>
                  <p className="text-xs text-ink-faint">{label}</p>
                </div>
              ))}
            </div>

            {usage ? (
              <p className="text-xs text-ink-faint flex items-center gap-2">
                <HardDrive size={13} />
                Using about {(usage.usedBytes / 1024 / 1024).toFixed(1)} MB of the{' '}
                {(usage.quotaBytes / 1024 / 1024 / 1024).toFixed(1)} GB this browser allows.
              </p>
            ) : null}

            <div className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
              <p className="text-sm leading-relaxed">
                <strong>Back up now and then.</strong> Your log lives in this browser's storage.
                Clearing site data, using a different browser, or resetting the computer will lose
                it. The export below is a plain JSON file — keep a copy somewhere safe.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Download size={16} />} onClick={doExport}>
                Export everything
              </Button>
              <Button icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>
                Import a backup
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void doImport(file);
                  e.target.value = '';
                }}
              />
            </div>

            {importMessage ? (
              <p className="text-sm rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
                {importMessage}
              </p>
            ) : null}

            <div className="pt-4 border-t border-line">
              <Button
                variant="danger"
                icon={<Trash2 size={16} />}
                onClick={() => setConfirmErase(true)}
              >
                Erase everything
              </Button>
            </div>
          </Card>
        </section>

        {/* --- about --- */}
        <section>
          <SectionHeading title="About Rehabit" />
          <Card className="space-y-4">
            <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3.5 flex gap-3">
              <ShieldAlert size={18} className="text-danger shrink-0 mt-0.5" />
              <div className="text-sm leading-relaxed space-y-2">
                <p className="font-semibold">
                  Rehabit is not a medical device and is not a substitute for your therapist or
                  doctor.
                </p>
                <p className="text-ink-soft">
                  Its angle measurements come from an ordinary webcam and can be out by a
                  significant margin. Use them to watch your own trend, never to decide whether
                  something is healing, how hard to push, or which exercises to do. If you get new
                  or worsening pain, numbness, or weakness, contact your clinician. If you see
                  sudden face drooping, arm weakness, or speech difficulty, call emergency services
                  immediately.
                </p>
              </div>
            </div>

            <div className="text-sm text-ink-soft space-y-2 leading-relaxed">
              <p className="flex items-start gap-2">
                <Info size={15} className="mt-0.5 shrink-0" />
                Pose estimation runs on-device with MediaPipe Tasks Vision. Model files are stored
                in this app's own folder, so once installed it works with the network switched off.
              </p>
              <p className="flex items-start gap-2">
                <User size={15} className="mt-0.5 shrink-0" />
                No account, no server, no analytics. Nothing you type or do here is transmitted.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Chip>Version 0.1.0</Chip>
              <Chip>MIT licensed</Chip>
              <Chip tone="brand">Local-first</Chip>
              {settings.disclaimerAcceptedAt ? (
                <Chip>
                  Terms accepted {new Date(settings.disclaimerAcceptedAt).toLocaleDateString()}
                </Chip>
              ) : null}
            </div>
          </Card>
        </section>
      </div>

      <EraseDialog open={confirmErase} onClose={() => setConfirmErase(false)} />
    </>
  );
}

function EraseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const ok = typed.trim().toUpperCase() === 'ERASE';

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Erase everything?"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            disabled={!ok}
            onClick={async () => {
              await eraseEverything();
              onClose();
            }}
          >
            Erase it all
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed">
          This deletes every session, prescription, custom exercise, and measurement from this
          browser. It cannot be undone, and there is no copy anywhere else.
        </p>
        <p className="text-sm leading-relaxed text-ink-soft">
          If you have not exported a backup yet, cancel and do that first.
        </p>
        <Field label="Type ERASE to confirm" htmlFor="erase-confirm">
          <TextInput
            id="erase-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="ERASE"
            className={cx(ok && 'border-danger')}
          />
        </Field>
      </div>
    </Modal>
  );
}
