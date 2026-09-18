'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { initialsOf } from '@/lib/demo-data';

/**
 * Monogram disc, standing in for the photo avatars in the reference.
 *
 * We have no portraits and inventing faces for a payments demo would be worse
 * than not having them. Initials in a disc carry the same scanning job, read
 * at any size, need no network request, and stay inside the monochrome system.
 *
 * A person is filled, a business is outlined. That is the same fill and weight
 * distinction the corridor rail uses, applied to a different axis, and it lets
 * the eye sort a transaction list without reading a word of it.
 */
export function Monogram({
  name,
  kind = 'person',
  size = 40,
  className,
}: {
  name: string;
  kind?: 'person' | 'business';
  size?: number;
  className?: string;
}) {
  const filled = kind === 'person';

  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-[-0.01em]',
        filled
          ? 'bg-ink text-paper'
          : 'border-[1.5px] border-ink bg-paper text-ink',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * A counterparty's portrait, with the monogram behind it.
 *
 * Two facts the interface has to hold at once: some counterparties have a
 * picture and some do not, and the ones that do not are mostly businesses
 * rather than missing people. So this is not a loader with a placeholder, it
 * is a portrait *or* a monogram, and both are finished states.
 *
 * The fallback is on `onError` rather than on a check that the file exists,
 * because a client component cannot ask the filesystem anything. A portrait
 * that has not been supplied yet fails its request once and the monogram
 * takes the space, with no layout shift: the disc is the same size either
 * way and is already painted underneath.
 */
/**
 * Portraits already known to be absent.
 *
 * Module scope rather than component state, because the same person is drawn
 * in several places at once: the rail, the header, a transaction row, the
 * beneficiary book. Per-instance state means each of those requests the same
 * missing file and each logs its own 404. One shared set means the first
 * failure is the last request.
 */
const missing = new Set<string>();

export function Avatar({
  id,
  name,
  kind = 'person',
  size = 44,
  className,
}: {
  /** File stem in `public/avatars`. Null draws the monogram directly. */
  id?: string | null;
  name: string;
  kind?: 'person' | 'business';
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const usePortrait = Boolean(id) && !failed && !missing.has(id as string);

  return (
    <span
      style={{ width: size, height: size }}
      className={cn('relative inline-block shrink-0', className)}
    >
      <Monogram name={name} kind={kind} size={size} />

      {usePortrait && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/avatars/${id}.png`}
          alt=""
          aria-hidden
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => {
            if (id) missing.add(id);
            setFailed(true);
          }}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      )}
    </span>
  );
}

/** A small circular icon button, as used along the sidebar and header. */
export function IconButton({
  children,
  label,
  active,
  onClick,
  className,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={label}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
        active
          ? 'bg-ink text-paper'
          : 'border border-rule bg-paper text-ink-muted hover:border-ink hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Section heading used inside dashboard cards. */
export function CardLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[14px] font-semibold tracking-[-0.015em]">{children}</h2>
      {action}
    </div>
  );
}

/**
 * The small circular mark that follows "Paid" or "Received" on a row.
 *
 * Taken from the reference, where it sits after the status word as a quiet
 * second glyph. Here it carries something rather than decorating: it is the
 * row's provenance, and hovering it gives the timestamp and what the movement
 * was for.
 *
 * Weight says which half of the ledger a row came from. Solid ink is a
 * movement that actually happened, hairline is opening history. That is the
 * same fill and outline rule the corridor rail uses for KORA's leg and
 * Pollar's, applied to the only other place in the app where real and sample
 * data sit in one list.
 */
export function StatusMark({
  real,
  title,
}: {
  real: boolean;
  title: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center justify-center align-[-1px]',
        real ? 'text-ink' : 'text-ink-ghost',
      )}
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
        <path
          d="M10 6a4 4 0 1 1-1.4-3.05"
          stroke="currentColor"
          strokeWidth={real ? 1.7 : 1.3}
          strokeLinecap="round"
        />
        <path
          d="M10.4 1.1v2.2H8.2"
          stroke="currentColor"
          strokeWidth={real ? 1.7 : 1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
