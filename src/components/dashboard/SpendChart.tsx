'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

/*
 * A dot is a share of its column rather than a fixed size, capped so it never
 * swells into a blob.
 *
 * Fixed-width dots kept the vertical gaps honest and let the horizontal ones
 * drift: the same 5px dot sat in a 10px column on a desktop and a 15px one on
 * a phone, so the field went from square to a set of ruled lines purely by
 * being looked at on something narrower. A share of the column keeps both gaps
 * in step across widths and across the three ranges.
 */
const DOT_MAX = 7;

/*
 * Chosen so the grid comes out square.
 *
 * In the column the chart sits in, fourteen rows over 150px puts one dot every
 * 10.7px vertically, which is what the horizontal pitch works out to as well.
 * A matrix whose rows are tighter than its columns reads as a set of vertical
 * lines rather than as a field of dots, and the field is the whole effect.
 */
const PLOT_HEIGHT = 150;

/**
 * The column pitch the matrix is drawn at, near enough.
 *
 * The chart runs the width of the dashboard, so how many columns fit is a
 * property of the window rather than of the data. The feed sends more history
 * than any one screen can draw and this decides how much of the tail to take:
 * roughly three months of days on a wide monitor, about four weeks of them on
 * a phone, at the same density either way.
 */
const TARGET_PITCH = 11;

/** Never draw fewer than this, however narrow it gets. */
const MIN_COLUMNS = 12;

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

  /*
   * How wide the plot actually is, measured rather than guessed.
   *
   * There is no way to ask CSS for a column count, and the answer changes when
   * the workspace panel opens as well as when the window resizes, so the
   * element has to be measured and then watched.
   *
   * Measured once by hand before the observer is attached, and that ordering
   * is the whole point. A ResizeObserver delivers its first callback on the
   * next rendering step, and a page that is not being rendered has no next
   * rendering step: open the app in a background tab and the chart waits for a
   * width that never arrives. `getBoundingClientRect` is synchronous and owes
   * nothing to the compositor, so the first paint always has a number and the
   * observer is left to do what it is actually good at, which is noticing the
   * second one.
   */
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(0);

  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;

    setPlotWidth(node.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) => {
      setPlotWidth(entry.contentRect.width);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const all = useMemo(() => series?.buckets ?? [], [series]);

  /*
   * The tail that fits, newest always included.
   *
   * Taken from the end rather than the start, because the recent columns are
   * the ones anybody is looking for and a narrow screen should lose last
   * spring rather than this week.
   */
  const buckets = useMemo(() => {
    if (all.length === 0 || plotWidth === 0) return [];
    const fits = Math.max(MIN_COLUMNS, Math.floor(plotWidth / TARGET_PITCH));
    return all.slice(Math.max(0, all.length - fits));
  }, [all, plotWidth]);

  const max = useMemo(() => Math.max(1, ...buckets.map((b) => b.amount)), [buckets]);
  const total = useMemo(() => buckets.reduce((sum, b) => sum + b.amount, 0), [buckets]);

  /*
   * The tallest column of the ones on screen, which is what the chart
   * annotates until somebody hovers something else. Recomputed against what is
   * drawn rather than against the whole series, so the callout never points
   * off the left edge at a column that was not taken.
   */
  const peakIndex = useMemo(() => {
    let peak = 0;
    for (let n = 1; n < buckets.length; n += 1) {
      if (buckets[n].amount > buckets[peak].amount) peak = n;
    }
    return peak;
  }, [buckets]);

  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setSelected(peakIndex);
  }, [peakIndex]);

  const current = buckets[selected] ?? null;

  /**
   * Plain words for the window actually on screen.
   *
   * Counted from what is drawn rather than from what was sent, so it stays
   * true when a narrower window takes fewer columns. Whole years are said as
   * years, because "Last 60 months" is a number somebody has to divide.
   */
  const window = useMemo(() => {
    const n = buckets.length;
    if (!series || n === 0) return 'Loading';
    if (series.unit === 'month' && n >= 24 && n % 12 === 0) return `Last ${n / 12} years`;
    return `Last ${n} ${series.unit}${n === 1 ? '' : 's'}`;
  }, [buckets.length, series]);

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
    <div className="card-block rise rounded-[22px] bg-paper p-5">
      <CardLabel action={<RangePicker range={range} onChange={setRange} />}>
        Outbound spend
      </CardLabel>

      {/*
       * The callout is drawn above the plot, so the gap under the heading has
       * to clear its full height rather than look like a comfortable margin.
       * A smaller gap puts the callout through the range picker.
       */}
      <div className="relative mt-[62px]">
        {/*
          * The callout and the ring glide between columns rather than cutting.
          * Sweeping a cursor across ninety columns is the one gesture this
          * chart really has, and a label that teleports on every column makes
          * it read as ninety separate charts instead of one continuous one.
          */}
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full transition-[left] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
          style={{ left: `${calloutPercent}%` }}
        >
          <div className="rounded-xl bg-accent px-3 py-2 text-center text-ink shadow-[0_6px_16px_-8px_rgba(15,17,16,0.25)]">
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
            className="pointer-events-none absolute -top-[3px] z-10 h-[10px] w-[10px] -translate-x-1/2 rounded-full border-[2.5px] border-accent-deep bg-paper transition-[left] duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
          />
        )}

        <div
          ref={plotRef}
          className="flex items-end"
          style={{ height: PLOT_HEIGHT }}
          role="img"
          aria-label={
            current
              ? `Outbound spend, ${window.toLowerCase()}. ${current.label} at ${current.amount.toLocaleString()} naira.`
              : 'Outbound spend, loading.'
          }
        >
          {buckets.length === 0
            ? Array.from({ length: 30 }, (_, n) => (
                <span key={n} className="flex-1">
                  <span
                    style={{ maxWidth: DOT_MAX }}
                    className="mx-auto block aspect-square w-[55%] rounded-full bg-paper-sunk"
                  />
                </span>
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
        <span>{window}</span>
        <span className="tabular">
          {buckets.length > 0 ? `₦${total.toLocaleString()} out` : ''}
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
              'aspect-square w-[55%] shrink-0 rounded-full',
              'transition-colors duration-[130ms] motion-reduce:transition-none',
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
        className="press appearance-none rounded-lg border border-rule bg-paper py-1 pl-2.5 pr-7 text-[11px] font-medium text-ink-muted outline-none hover:border-ink hover:text-ink"
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
