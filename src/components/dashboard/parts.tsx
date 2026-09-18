'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { formatNaira, initialsOf, relativeDay } from '@/lib/demo-data';
import type { ActivityItem } from '@/lib/account/activity';

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
 * Portraits already known to be absent.
 *
 * Module scope rather than component state, because the same person is drawn
 * in several places at once: the rail, the header, a transaction row, the
 * beneficiary book. Per-instance state means each of those requests the same
 * missing file and each logs its own 404. One shared set means the first
 * failure is the last request.
 */
const missing = new Set<string>();

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
 * that has not been supplied yet fails its request once and the monogram takes
 * the space, with no layout shift: the disc is the same size either way and is
 * already painted underneath.
 *
 * Drawn through `next/image` rather than a bare tag, and the reason is the
 * supplied files. They are full resolution portraits, between one and six
 * megabytes each, and every one of them is painted here at 44 pixels or less.
 * A plain tag ships the whole thing down the wire so the browser can throw
 * ninety nine percent of it away during a downscale. The optimiser resizes
 * once, encodes to AVIF or WebP, caches the result and serves the size the
 * device actually asked for.
 *
 * `width` and `height` carry the drawn size rather than the file's, which is
 * what the srcset is derived from: at 44 the optimiser is asked for 48 and 96,
 * the second being the retina pair. The originals stay untouched on disk.
 */
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
        <Image
          src={`/avatars/${id}.png`}
          alt=""
          aria-hidden
          width={size}
          height={size}
          quality={80}
          /*
           * Eager, against the default.
           *
           * Lazy loading exists to avoid paying for pixels nobody scrolls to,
           * and it buys nothing here: the optimised portrait is about a
           * kilobyte and a half, every one of them is the primary visual
           * anchor of a row at the top of the page, and the panels that hold
           * the rest are not in the DOM until they are opened. All lazy adds
           * is an intersection callback standing between the page and ten
           * kilobytes.
           */
          loading="eager"
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
        'press flex h-11 w-11 items-center justify-center rounded-full',
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
 * One movement, as a card.
 *
 * Shared between the dashboard's four rows and the full list in the workspace
 * panel, because they are the same object seen twice and letting them drift
 * would mean two answers to what a transaction looks like.
 *
 * Three columns and nothing else: portrait, who and what happened, how much.
 * The direction badge that used to sit on the right is gone, since the sign
 * and the colour already say which way the money went.
 */
export function TransactionRow({
  tx,
  showDate = false,
  index = 0,
}: {
  tx: ActivityItem;
  /** The panel says when, since it is a history rather than a headline. */
  showDate?: boolean;
  /**
   * Position in the list, which drives the entrance delay.
   *
   * Capped at eight here rather than in the stylesheet, because the cap is a
   * fact about this list and not about staggering. A thirty row history whose
   * last row waits over a second has stopped making an entrance and started
   * looking like a page that has not finished loading.
   */
  index?: number;
}) {
  const incoming = tx.direction === 'in';
  const when = relativeDay(tx.at);

  return (
    <li
      style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
      className="card-row stagger lift flex items-center gap-3 rounded-[18px] bg-paper px-3.5 py-2.5"
    >
      <Avatar id={tx.avatarId} name={tx.party} kind={tx.kind} size={44} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium tracking-[-0.01em]">{tx.party}</div>
        {/*
          * The status line carries the tooltip. It holds the timestamp and the
          * reason for the movement, and neither has anywhere else to live on a
          * card this spare.
          */}
        <div
          title={`${when}. ${tx.detail}${tx.real ? '' : ' (opening history)'}`}
          className="mt-0.5 w-fit truncate text-[11.5px] text-ink-faint"
        >
          {incoming ? 'Received' : 'Paid'}
          {showDate && <span className="text-ink-ghost"> &middot; {when}</span>}
        </div>
      </div>

      <span
        className={cn(
          'tabular shrink-0 text-[14px] font-semibold tracking-[-0.01em]',
          incoming ? 'text-gain' : 'text-loss',
        )}
      >
        {formatNaira(tx.amount, { signed: true })}
      </span>
    </li>
  );
}

/**
 * What a row looks like before the feed answers.
 *
 * Drawn at the real row's dimensions rather than as a shorter bar, so nothing
 * reflows when the data lands.
 */
export function RowSkeleton({ index = 0 }: { index?: number }) {
  return (
    <li className="card-row breathe flex items-center gap-3 rounded-[18px] bg-paper px-3.5 py-2.5">
      <span
        style={{ animationDelay: `${index * 90}ms` }}
        className="h-11 w-11 shrink-0 rounded-full bg-paper-sunk"
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <span className="block h-3 w-1/2 rounded bg-paper-sunk" />
        <span className="block h-2.5 w-1/4 rounded bg-paper-sunk" />
      </div>
      <span className="h-3.5 w-20 shrink-0 rounded bg-paper-sunk" />
    </li>
  );
}
