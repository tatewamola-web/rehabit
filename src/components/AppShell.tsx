/**
 * Navigation chrome: a sidebar on wide screens, a bottom bar on narrow ones.
 * The disclaimer strip is part of the shell rather than per-page so it cannot
 * be lost by scrolling or by a page forgetting to include it.
 */
import type { ReactNode } from 'react';
import {
  CalendarCheck,
  Dumbbell,
  Gauge,
  LineChart,
  Settings as SettingsIcon,
  Video,
} from 'lucide-react';
import { cx } from './ui';
import { navigate } from '../lib/router';

export const NAV_ITEMS = [
  { path: '/', label: 'Today', icon: CalendarCheck },
  { path: '/exercises', label: 'Exercises', icon: Dumbbell },
  { path: '/motion', label: 'Motion', icon: Video },
  { path: '/progress', label: 'Progress', icon: LineChart },
  { path: '/metrics', label: 'Measures', icon: Gauge },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
] as const;

export function AppShell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:card focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      <div className="lg:flex">
        {/* Sidebar — wide screens */}
        <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 lg:h-dvh lg:sticky lg:top-0 border-r border-line bg-surface/60 px-3 py-5">
          <div className="flex items-center gap-2.5 px-2 mb-6">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="w-8 h-8 rounded-lg" />
            <div className="leading-tight">
              <p className="font-semibold tracking-tight">Rehabit</p>
              <p className="text-[0.7rem] text-ink-faint">stays on this computer</p>
            </div>
          </div>

          <nav aria-label="Main" className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = path === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition min-h-11',
                    active
                      ? 'bg-brand-soft text-brand-ink'
                      : 'text-ink-soft hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto px-3 pt-6">
            <p className="text-[0.7rem] leading-relaxed text-ink-faint">
              Not a medical device. Follow the program your own therapist gave you.
            </p>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Header — narrow screens */}
          <header className="lg:hidden sticky top-0 z-30 bg-bg/85 backdrop-blur border-b border-line px-4 py-3 flex items-center gap-2.5">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="w-7 h-7 rounded-lg" />
            <p className="font-semibold tracking-tight">Rehabit</p>
            <span className="ml-auto text-[0.7rem] text-ink-faint">not medical advice</span>
          </header>

          <main id="main" className="grow px-4 sm:px-6 lg:px-8 py-5 sm:py-7 pb-24 lg:pb-10">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </div>

      {/* Bottom bar — narrow screens */}
      <nav
        aria-label="Main"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line grid grid-cols-6 pb-[env(safe-area-inset-bottom)]"
      >
        {NAV_ITEMS.map((item) => {
          const active = path === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex flex-col items-center gap-0.5 py-2.5 text-[0.65rem] font-medium min-h-14 transition',
                active ? 'text-brand-ink' : 'text-ink-faint',
              )}
            >
              <item.icon size={19} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-ink-soft mt-1 text-sm sm:text-base">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
