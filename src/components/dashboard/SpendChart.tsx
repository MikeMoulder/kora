'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardLabel } from './parts';
import {
  SPEND_RANGES,
  SPEND_RANGE_LABELS,
  type ActivityPayload,
  type SpendRange,
} from '@/lib/account/activity';

/**
 * Outbound spend, drawn as a dot matrix.
 *
 * The reference renders its columns as stacks of dots rather than solid bars,
 * which is the detail that makes the chart read as a texture instead of a
 * spreadsheet.
 *
 * Built out of elements rather than SVG, after the SVG version turned every
 * dot into an ellipse. A viewBox stretched to an arbitrary container with
 * `preserveAspectRatio="none"` scales x and y by different factors, and a
 * circle cannot survive that. Laying the dots out with flex keeps them round
 * at any width, lets the column count change between ranges without any
 * arithmetic, and makes each column a real focusable element rather than an
 * invisible hit rectangle.
 *
 * Dots quantise the values, so a column is a rounded count rather than an
 * exact height. That is right for a shape-of-spending chart and wrong for
 * anything read to the naira, which is why the figure is printed in the
 * callout rather than left to be measured off the dots.
 */

/**
 * Rows in the matrix, the plot they fill, and the widest a dot may get.
 *
 * A dot takes its height from its width, so it is round whether the range is
 * thirty columns or twelve. That leaves the rows to be spaced by distributing
 * whatever height is left over rather than by a fixed gap, which is why the
 * plot height is a constant here and the pitch is not: a fixed pitch and a
 * variable dot size cannot both hold, and a chart that changes height when
 * somebody opens the dropdown moves the card underneath it.
 */
const ROWS = 14;
const DOT_MAX = 5;

/*
 * Chosen so the grid comes out square.
 *
 * In the column the chart sits in, fourteen rows over 150px puts one dot every
 * 10.7px vertically, which is what the horizontal pitch works out to as well.
 * A matrix whose rows are tighter than its columns reads as a set of vertical
 * lines rather than as a field of dots, and the field is the whole effect.
 */
const PLOT_HEIGHT = 150;

export function SpendChart({ activity }: { activity: ActivityPayload | null }) {
  /*
   * Daily is the resting view.
   *
   * It is the range where a payment made a minute ago is visible as itself
   * rather than folded into a week, which is the whole reason the chart reads
   * from the ledger. The longer ranges are for shape; this one is for what
   * just happened.
   */
  const [range, setRange] = useState<SpendRange>('daily');

  const series = activity?.spend[range] ?? null;
  const buckets = useMemo(() => series?.buckets ?? [], [series]);

  const [selected, setSelected] = useState(0);

  // The peak is what the chart annotates until somebody hovers something else.
  useEffect(() => {
    if (series) setSelected(series.peakIndex);
  }, [series]);

  const max = useMemo(() => Math.max(1, ...buckets.map((b) => b.amount)), [buckets]);
  const current = buckets[selected] ?? null;

  /*
   * Two positions, not one.
   *
   * The ring sits on the column it marks, wherever that is. The callout is
   * pulled back from the edges so it stays inside the card, which means the
   * two part company for the first and last few columns. Driving both off one
   * clamped figure put the ring a column or two away from the selection at
   * either end, which is worse than a callout that is not quite centred.
   */
  const columnPercent = ((selected + 0.5) / Math.max(1, buckets.length)) * 100;
  const calloutPercent = Math.min(86, Math.max(14, columnPercent));

  return (
    <div className="card-block rounded-[22px] bg-paper p-5">
      <CardLabel action={<RangePicker range={range} onChange={setRange} />}>
        Outbound spend
      </CardLabel>

      {/*
       * The callout is drawn above the plot, so the gap under the heading has
       * to clear its full height rather than look like a comfortable margin.
       * A smaller gap puts the callout through the range picker.
       */}
      <div className="relative mt-[62px]">
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full"
          style={{ left: `${calloutPercent}%` }}
        >
          <div className="rounded-xl bg-accent px-3 py-2 text-center text-ink shadow-[0_6px_16px_-8px_rgba(15,17,16,0.5)]">
            <div className="tabular whitespace-nowrap text-[15px] font-bold leading-none tracking-[-0.03em]">
              &#8358;{(current?.amount ?? 0).toLocaleString()}
            </div>
            <div className="mt-1 whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.1em] text-ink/55">
              {current?.label ?? 'No data'}
            </div>
          </div>
        </div>

        {/*
         * The ring the reference puts at the head of the selected column.
         * Drawn over the plot rather than inside the column, so marking a
         * column does not change how tall its stack of dots is and the rows
         * stay level across the whole chart.
         */}
        {current && (
          <span
            aria-hidden
            style={{ left: `${columnPercent}%` }}
            className="pointer-events-none absolute -top-[3px] z-10 h-[10px] w-[10px] -translate-x-1/2 rounded-full border-[2.5px] border-accent-deep bg-paper"
          />
        )}

        <div
          className="flex items-end gap-[2px]"
          style={{ height: PLOT_HEIGHT }}
          role="img"
          aria-label={
            series
              ? `Outbound spend, ${series.window.toLowerCase()}. ${current?.label ?? 'Nothing'} at ${(current?.amount ?? 0).toLocaleString()} naira.`
              : 'Outbound spend, loading.'
          }
        >
          {buckets.length === 0
            ? Array.from({ length: 30 }, (_, n) => (
                <span key={n} className="h-[5px] flex-1 rounded-full bg-paper-sunk" />
              ))
            : buckets.map((bucket, column) => (
                <Column
                  key={bucket.at}
                  filled={Math.max(1, Math.round((bucket.amount / max) * ROWS))}
                  selected={column === selected}
                  label={`${bucket.label}, ${bucket.amount.toLocaleString()} naira`}
                  onSelect={() => setSelected(column)}
                />
              ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-rule pt-3 text-[11px] text-ink-faint">
        <span>{series?.window ?? 'Loading'}</span>
        <span className="tabular">
          {series ? `₦${series.total.toLocaleString()} out` : ''}
        </span>
      </div>
    </div>
  );
}

/**
 * One period.
 *
 * Stacked bottom up, which is what `flex-col-reverse` buys: the lit dots are
 * the first children and sit on the baseline, so a column grows upward
 * without anything being positioned.
 *
 * The selected column carries its value in solid accent and then continues to
 * the top of the plot in the soft one. That stem is the reference's pointer
 * line, and keeping the two tones apart means the selection reads as a cursor
 * without erasing how tall the column actually is.
 *
 * The bottom row is always lit. It is the baseline rather than a value, and it
 * is what stops a quiet Sunday from reading as a hole in the chart.
 */
function Column({
  filled,
  selected,
  label,
  onSelect,
}: {
  filled: number;
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      onClick={onSelect}
      className="flex h-full flex-1 cursor-pointer flex-col-reverse items-center justify-between rounded-sm outline-none"
    >
      {Array.from({ length: ROWS }, (_, row) => {
        const lit = row < filled;

        return (
          <span
            key={row}
            style={{ maxWidth: DOT_MAX }}
            className={cn(
              'aspect-square w-full shrink-0 rounded-full',
              lit
                ? selected
                  ? 'bg-accent-deep'
                  : 'bg-ink-faint'
                : // Unlit rows still take their space, so the grid stays square.
                  selected
                  ? 'bg-accent-soft'
                  : 'bg-transparent',
            )}
          />
        );
      })}
    </button>
  );
}

/**
 * Daily, weekly or yearly.
 *
 * A real select under a styled pill rather than a menu built out of divs. It
 * is three mutually exclusive options and the platform already has a control
 * for that, one that opens from the keyboard, announces itself to a screen
 * reader and behaves like every other select on the machine.
 */
function RangePicker({
  range,
  onChange,
}: {
  range: SpendRange;
  onChange: (next: SpendRange) => void;
}) {
  return (
    <div className="relative">
      <select
        value={range}
        onChange={(e) => onChange(e.target.value as SpendRange)}
        aria-label="Spend period"
        className="appearance-none rounded-lg border border-rule bg-paper py-1 pl-2.5 pr-7 text-[11px] font-medium text-ink-muted outline-none transition-colors hover:border-ink hover:text-ink"
      >
        {SPEND_RANGES.map((option) => (
          <option key={option} value={option}>
            {SPEND_RANGE_LABELS[option]}
          </option>
        ))}
      </select>

      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint"
        strokeWidth={2}
      />
    </div>
  );
}
