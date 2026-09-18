'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CorridorReadiness } from '@/lib/corridor/types';

/**
 * Interface primitives for the monochrome build.
 *
 * The one rule these exist to hold: ownership is carried by fill and weight,
 * never by hue. Solid black is the leg KORA built, a hairline outline is the
 * leg Pollar owns, a dashed outline is simulated. Components reach for the
 * `leg-*` classes in globals.css instead of restating borders, so the language
 * cannot drift from screen to screen.
 */

export type Owner = 'ours' | 'theirs' | 'simulated' | 'idle';

// ── Surfaces ──────────────────────────────────────────────────────────────

export function Panel({
  children,
  className,
  inset,
}: {
  children: ReactNode;
  className?: string;
  /** Sits the panel on the sunk surface rather than paper. */
  inset?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-rule',
        inset ? 'bg-paper-sunk' : 'bg-paper',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Rule({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-rule', className)} aria-hidden />;
}

// ── Ownership ─────────────────────────────────────────────────────────────

const OWNER_CLASS: Record<Owner, string> = {
  ours: 'leg-ours',
  theirs: 'leg-theirs',
  simulated: 'leg-simulated',
  idle: 'leg-idle',
};

/**
 * A small tag carrying who owns something. The label is always written out as
 * well as drawn, because the visual language should reward a careful reader
 * rather than being the only way to know.
 */
export function OwnerTag({
  owner,
  children,
  className,
}: {
  owner: Owner;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[11px] font-medium',
        OWNER_CLASS[owner],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Corridor readiness. Mirrors the ownership language: an executable corridor
 * is filled, a sandbox one is outlined, a planned one is dashed and muted.
 */
export function ReadinessBadge({
  readiness,
  className,
}: {
  readiness: CorridorReadiness;
  className?: string;
}) {
  const map: Record<CorridorReadiness, { owner: Owner; label: string }> = {
    live: { owner: 'ours', label: 'Live' },
    sandbox: { owner: 'theirs', label: 'Sandbox' },
    planned: { owner: 'simulated', label: 'Planned' },
  };
  const { owner, label } = map[readiness];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-medium uppercase tracking-[0.1em]',
        OWNER_CLASS[owner],
        className,
      )}
    >
      {label}
    </span>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────

export function Button({
  children,
  onClick,
  disabled,
  busy,
  variant = 'solid',
  type = 'button',
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** `solid` is KORA acting, `outline` is Pollar acting, `quiet` is neither. */
  variant?: 'solid' | 'outline' | 'quiet';
  type?: 'button' | 'submit';
  className?: string;
}) {
  const variants = {
    solid:
      'bg-ink text-paper border border-ink hover:bg-ink-soft hover:border-ink-soft disabled:bg-ink-ghost disabled:border-ink-ghost disabled:text-paper',
    outline:
      'bg-paper text-ink border-[1.5px] border-ink hover:bg-paper-edge disabled:border-rule disabled:text-ink-faint',
    quiet:
      'bg-transparent text-ink-muted border border-transparent hover:text-ink disabled:text-ink-ghost',
  } as const;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium',
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
    <svg className={cn('h-3.5 w-3.5 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────

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
    lg: 'text-[28px]',
    xl: 'text-[44px] sm:text-[56px]',
  } as const;

  return (
    <span className={cn('tabular font-semibold tracking-[-0.02em]', sizes[size], className)}>
      {amount.toLocaleString(undefined, {
        minimumFractionDigits: currency === 'USDC' ? 2 : 0,
        maximumFractionDigits: currency === 'USDC' ? 7 : 2,
      })}
      <span className="ml-1.5 font-medium text-ink-faint">{currency}</span>
    </span>
  );
}

export function Row({
  label,
  children,
  note,
  className,
}: {
  label: string;
  children: ReactNode;
  note?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-6 py-2.5', className)}>
      <div className="min-w-0">
        <div className="text-sm text-ink-soft">{label}</div>
        {note && <div className="mt-0.5 text-xs leading-relaxed text-ink-faint">{note}</div>}
      </div>
      <div className="shrink-0 text-right">{children}</div>
    </div>
  );
}

/**
 * An aside. `simulated` uses the dashed rule so a caveat about something not
 * being real looks the same as the thing it is describing.
 */
export function Note({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'simulated' | 'strong';
  className?: string;
}) {
  const tones = {
    neutral: 'border border-rule bg-paper-sunk text-ink-soft',
    simulated: 'leg-simulated',
    strong: 'border border-ink bg-paper text-ink',
  } as const;

  return (
    <div className={cn('rounded-lg px-3.5 py-3 text-[13px] leading-relaxed', tones[tone], className)}>
      {children}
    </div>
  );
}

export function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(value)}
      className="group flex w-full items-start justify-between gap-4 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-paper-sunk"
    >
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wider text-ink-faint">{label}</span>
        <span className={cn('block truncate text-sm text-ink', mono && 'font-mono')}>{value}</span>
      </span>
      <span className="mt-4 shrink-0 text-[10px] uppercase tracking-wider text-ink-ghost opacity-0 transition-opacity group-hover:opacity-100">
        copy
      </span>
    </button>
  );
}

export { cn };
