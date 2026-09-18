'use client';

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
      <h2 className="text-[13px] font-semibold tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  );
}

/**
 * Direction marker for a transaction row.
 *
 * The reference used green for money in and red for money out. Monochrome has
 * to say the same thing without hue, so money in is an outlined disc with a
 * downward arrow and money out is filled with an upward one. Sign and weight
 * carry it, and it still works printed or for a colour blind reader.
 */
export function DirectionMark({ direction }: { direction: 'in' | 'out' }) {
  const incoming = direction === 'in';

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded-full',
        incoming ? 'border border-gain bg-paper text-gain' : 'bg-loss text-paper',
      )}
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
        <path
          d={incoming ? 'M6 2.5v7M3 6.5l3 3 3-3' : 'M6 9.5v-7M3 5.5l3-3 3 3'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
