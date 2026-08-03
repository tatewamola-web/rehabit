/**
 * Shared UI primitives.
 *
 * Sizing here is deliberately generous. The people using this may be working
 * one-handed, with a tremor, or with reduced vision, so nothing interactive is
 * smaller than a comfortable target and focus is always visible.
 */
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { X } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// --- button -----------------------------------------------------------------

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  block?: boolean;
};

const BUTTON_VARIANTS = {
  primary: 'bg-brand text-on-brand hover:brightness-110 border-transparent',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-soft border-transparent hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger-soft text-danger border-danger/40 hover:brightness-105',
} as const;

const BUTTON_SIZES = {
  sm: 'text-sm px-3 py-1.5 gap-1.5 min-h-9',
  md: 'text-sm px-4 py-2.5 gap-2 min-h-11',
  lg: 'text-base px-5 py-3 gap-2.5 min-h-13',
} as const;

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  block,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center rounded-xl border font-medium transition',
        'disabled:opacity-45 disabled:pointer-events-none select-none',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        block && 'w-full',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// --- surfaces ---------------------------------------------------------------

export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  return <As className={cx('card p-5', className)}>{children}</As>;
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="text-sm text-ink-soft mt-0.5">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'accent' | 'ok' | 'danger';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-soft border-line',
    brand: 'bg-brand-soft text-brand-ink border-brand/25',
    accent: 'bg-accent-soft text-accent-ink border-accent/30',
    ok: 'bg-ok-soft text-ok border-ok/30',
    danger: 'bg-danger-soft text-danger border-danger/30',
  } as const;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12 px-6">
      {icon ? <div className="text-ink-faint mb-3 flex justify-center">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {body ? <p className="text-sm text-ink-soft mt-1.5 max-w-sm mx-auto">{body}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

// --- form controls ----------------------------------------------------------

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-ink-soft leading-relaxed">{hint}</p> : null}
    </div>
  );
}

const CONTROL =
  'w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-sm min-h-11 ' +
  'placeholder:text-ink-faint transition focus:border-brand';

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(CONTROL, props.className)} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(CONTROL, 'leading-relaxed', props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(CONTROL, 'appearance-none pr-8', props.className)} />;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  suffix,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  label: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-stretch rounded-xl border border-line-strong overflow-hidden bg-surface">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        className="px-3.5 text-lg font-medium text-ink-soft hover:bg-surface-2 min-h-11"
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </button>
      <div className="flex-1 flex items-center justify-center gap-1 text-sm font-semibold tabular border-x border-line px-2">
        {value}
        {suffix ? <span className="text-ink-faint font-normal">{suffix}</span> : null}
      </div>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        className="px-3.5 text-lg font-medium text-ink-soft hover:bg-surface-2 min-h-11"
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-xl border border-line-strong bg-surface-2 p-1 gap-1 w-full"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cx(
            'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition min-h-10',
            value === opt.value
              ? 'bg-surface text-ink shadow-sm'
              : 'text-ink-soft hover:text-ink',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </label>
        {hint ? <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{hint}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative shrink-0 w-12 h-7 rounded-full transition border',
          checked ? 'bg-brand border-brand' : 'bg-surface-2 border-line-strong',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 w-5.5 h-5.5 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
          style={{ width: '1.375rem', height: '1.375rem' }}
        />
      </button>
    </div>
  );
}

/** 0–10 scale used for pain and fatigue. Optional by design — see LogDialog. */
export function ScaleSlider({
  value,
  onChange,
  label,
  lowLabel,
  highLabel,
  tone = 'brand',
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  label: string;
  lowLabel: string;
  highLabel: string;
  tone?: 'brand' | 'danger';
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {value == null ? (
          <button
            type="button"
            className="text-xs text-brand-ink underline underline-offset-2"
            onClick={() => onChange(5)}
          >
            add a rating
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span
              className={cx(
                'tabular text-sm font-semibold',
                tone === 'danger' && value >= 7 ? 'text-danger' : 'text-ink',
              )}
            >
              {value}/10
            </span>
            <button
              type="button"
              className="text-xs text-ink-faint underline underline-offset-2"
              onClick={() => onChange(undefined)}
            >
              clear
            </button>
          </div>
        )}
      </div>
      {value != null ? (
        <>
          <input
            id={id}
            type="range"
            min={0}
            max={10}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full mt-1"
          />
          <div className="flex justify-between text-xs text-ink-faint">
            <span>{lowLabel}</span>
            <span>{highLabel}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

// --- modal ------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        tabIndex={-1}
        className={cx(
          'relative card w-full max-h-[92vh] flex flex-col animate-in rounded-b-none sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-line">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-faint hover:text-ink -m-1 p-1 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto grow">{children}</div>
        {footer ? (
          <div className="px-5 py-4 border-t border-line flex gap-2 justify-end shrink-0">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// --- misc -------------------------------------------------------------------

export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'brand' | 'accent';
}) {
  const tones = {
    neutral: 'text-ink',
    brand: 'text-brand-ink',
    accent: 'text-accent-ink',
  } as const;
  return (
    <div className="card px-4 py-3.5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={cx('text-2xl font-semibold tabular mt-1', tones[tone])}>{value}</p>
      {sub ? <p className="text-xs text-ink-soft mt-0.5">{sub}</p> : null}
    </div>
  );
}

/** The line that has to appear anywhere a measurement is presented. */
export function EstimateNote({ className }: { className?: string }) {
  return (
    <p className={cx('text-xs text-ink-faint leading-relaxed', className)}>
      Camera measurements are estimates, not clinical measurements. Use them to compare yourself
      over time, not to judge whether you are “normal”.
    </p>
  );
}
