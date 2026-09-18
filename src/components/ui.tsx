'use client';

import type { ReactNode } from 'react';
import type { CorridorReadiness } from '@/lib/corridor/types';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function Card({
  children,
  className,
  leg = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  /** Which side of the corridor this panel belongs to. Drives the accent. */
  leg?: 'kora' | 'pollar' | 'neutral';
}) {
  const accent =
    leg === 'kora'
      ? 'before:bg-amber-core/70'
      : leg === 'pollar'
        ? 'before:bg-flow-core/70'
        : 'before:bg-ink-600';

  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-2xl border seam bg-ink-900/60 backdrop-blur-sm',
        'before:absolute before:inset-y-0 before:left-0 before:w-px',
        accent,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-400">
      {children}
    </div>
  );
}

const READINESS: Record<CorridorReadiness, { label: string; dot: string; text: string }> = {
  live: { label: 'Live', dot: 'bg-live', text: 'text-live' },
  sandbox: { label: 'Sandbox', dot: 'bg-sandbox', text: 'text-sandbox' },
  planned: { label: 'Planned', dot: 'bg-planned', text: 'text-ink-400' },
};

export function ReadinessBadge({
  readiness,
  className,
}: {
  readiness: CorridorReadiness;
  className?: string;
}) {
  const style = READINESS[readiness];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border seam px-2 py-0.5 text-[11px] font-medium',
        style.text,
        className,
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'kora' | 'pollar' | 'neutral' | 'warn';
}) {
  const tones = {
    kora: 'border-amber-core/30 bg-amber-wash text-amber-glow',
    pollar: 'border-flow-core/30 bg-flow-wash text-flow-glow',
    neutral: 'seam bg-ink-850 text-ink-300',
    warn: 'border-sandbox/30 bg-sandbox/10 text-sandbox',
  } as const;

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  busy,
  variant = 'primary',
  type = 'button',
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'pollar' | 'ghost' | 'quiet';
  type?: 'button' | 'submit';
  className?: string;
}) {
  const variants = {
    primary:
      'bg-amber-core text-ink-950 hover:bg-amber-glow disabled:bg-ink-700 disabled:text-ink-400',
    pollar:
      'bg-flow-core text-ink-950 hover:bg-flow-glow disabled:bg-ink-700 disabled:text-ink-400',
    ghost:
      'border seam-strong bg-transparent text-ink-200 hover:bg-ink-850 disabled:text-ink-500',
    quiet: 'text-ink-400 hover:text-ink-200 disabled:text-ink-600',
  } as const;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold',
        'transition-colors duration-150 disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('h-3.5 w-3.5 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Money({
  amount,
  currency,
  size = 'md',
  className,
}: {
  amount: number;
  currency: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-3xl',
    xl: 'text-5xl sm:text-6xl',
  } as const;

  const decimals = currency === 'USDC' ? Math.min(7, decimalsOf(amount)) : 2;

  return (
    <span className={cx('tabular font-semibold tracking-tight', sizes[size], className)}>
      {amount.toLocaleString(undefined, {
        minimumFractionDigits: currency === 'USDC' ? 2 : 0,
        maximumFractionDigits: decimals,
      })}
      <span className="ml-1.5 font-medium text-ink-400">{currency}</span>
    </span>
  );
}

function decimalsOf(n: number): number {
  const s = String(n);
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}

export function CopyField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(value)}
      className="group flex w-full items-start justify-between gap-4 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-ink-850"
    >
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wider text-ink-500">{label}</span>
        <span className={cx('block truncate text-sm text-ink-100', mono && 'font-mono')}>
          {value}
        </span>
      </span>
      <span className="mt-4 shrink-0 text-[10px] uppercase tracking-wider text-ink-600 opacity-0 transition-opacity group-hover:opacity-100">
        copy
      </span>
    </button>
  );
}

export function Row({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2">
      <div className="min-w-0">
        <div className="text-sm text-ink-300">{label}</div>
        {note && <div className="mt-0.5 text-xs leading-relaxed text-ink-500">{note}</div>}
      </div>
      <div className="shrink-0 text-right">{children}</div>
    </div>
  );
}

export function Note({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warn' | 'kora' | 'pollar';
}) {
  const tones = {
    neutral: 'seam bg-ink-850/60 text-ink-300',
    warn: 'border-sandbox/25 bg-sandbox/[0.07] text-sandbox/90',
    kora: 'border-amber-core/25 bg-amber-wash/60 text-amber-glow/90',
    pollar: 'border-flow-core/25 bg-flow-wash/60 text-flow-glow/90',
  } as const;

  return (
    <div className={cx('rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed', tones[tone])}>
      {children}
    </div>
  );
}
