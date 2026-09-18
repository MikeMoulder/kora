'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CardLabel } from './parts';
import { SPEND_WEEKS, SPEND_PEAK_INDEX } from '@/lib/demo-data';

/**
 * Outbound spend, drawn as a dot matrix.
 *
 * The reference rendered its bars as stacks of dots rather than solid columns,
 * which is the detail that makes the chart read as a texture instead of a
 * spreadsheet. Reproduced here in SVG so it stays crisp at any size, with the
 * selected column filled solid and the rest dropped back.
 *
 * Dots quantise the values, so a column is a rounded count rather than an
 * exact height. That is fine for a shape-of-spending chart and wrong for
 * anything read to the naira, which is why the precise figure is printed in
 * the callout rather than left to be measured off the dots.
 */

const ROWS = 14;
const DOT = 3.2;
const GAP_X = 6.4;
const GAP_Y = 6;

export function SpendChart() {
  const [selected, setSelected] = useState(SPEND_PEAK_INDEX);

  const max = useMemo(() => Math.max(...SPEND_WEEKS), []);
  const width = SPEND_WEEKS.length * GAP_X;
  const height = ROWS * GAP_Y;

  const selectedValue = SPEND_WEEKS[selected] * 1_000;

  // Keep the callout inside the plot rather than letting it run off an edge.
  const calloutPercent = Math.min(88, Math.max(12, ((selected + 0.5) / SPEND_WEEKS.length) * 100));

  return (
    <div className="rounded-xl border border-rule bg-paper p-5">
      <CardLabel
        action={
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg border border-rule px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:border-ink hover:text-ink"
          >
            Weekly
            <ChevronDown className="h-3 w-3" strokeWidth={2} />
          </button>
        }
      >
        Outbound spend
      </CardLabel>

      <div className="relative mt-6">
        {/* Callout for the selected column. */}
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full"
          style={{ left: `${calloutPercent}%` }}
        >
          <div className="rounded-lg bg-ink px-3 py-2 text-paper">
            <div className="tabular text-[15px] font-semibold leading-none">
              &#8358;{selectedValue.toLocaleString()}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-paper/55">
              Week {selected + 1}
            </div>
          </div>
          <div className="mx-auto h-2 w-px bg-ink" />
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[132px] w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Weekly outbound spend across ${SPEND_WEEKS.length} weeks. Week ${selected + 1} selected at ${selectedValue.toLocaleString()} naira.`}
        >
          {SPEND_WEEKS.map((value, column) => {
            const filled = Math.max(1, Math.round((value / max) * ROWS));
            const isSelected = column === selected;

            return (
              <g key={column}>
                {Array.from({ length: ROWS }, (_, row) => {
                  // Rows count up from the bottom of the plot.
                  const fromBottom = ROWS - 1 - row;
                  const on = fromBottom < filled;
                  if (!on) return null;

                  return (
                    <circle
                      key={row}
                      cx={column * GAP_X + GAP_X / 2}
                      cy={row * GAP_Y + GAP_Y / 2}
                      r={DOT / 2}
                      className={isSelected ? 'fill-ink' : 'fill-ink-faint'}
                    />
                  );
                })}

                {/* Full height hit area, so a thin column is still easy to hit. */}
                <rect
                  x={column * GAP_X}
                  y={0}
                  width={GAP_X}
                  height={height}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setSelected(column)}
                  onFocus={() => setSelected(column)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-rule pt-3 text-[11px] text-ink-faint">
        <span>52 weeks</span>
        <span>Hover a column to read its week</span>
      </div>
    </div>
  );
}
