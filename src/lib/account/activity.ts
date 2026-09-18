/**
 * The account's activity: what moved, when, and which way.
 *
 * This replaces the two hardcoded arrays the dashboard used to read from. It
 * is the same shape the balance already takes, and for the same reason: an
 * opening history that is fixed and labelled as sample data, with everything
 * that actually happened appended on top.
 *
 *   opening history  invented, deterministic, twelve months deep
 *   ledger entries   real movements, from the corridor and from Flutterwave
 *
 * Both feed one list, and the list feeds both the transaction rows and the
 * spend chart. That matters more than it sounds: when those were two separate
 * constants, a payment could go out through the corridor, leave the balance,
 * and appear in neither. Now a single send lands in the rows and moves the
 * chart, because there is only one set of facts for both to read.
 *
 * Nothing here is generated with `Math.random`. The opening history comes out
 * of a seeded generator, so the same day produces the same history on every
 * restart, on every machine, and in every process. A demo whose chart
 * reshuffles between two page loads is worse than one that does not, and a
 * history that differs between the server and the client is a hydration bug.
 */

import type { LedgerEntry } from './ledger';
import { BENEFICIARIES, INCOME_SOURCES } from '@/lib/demo-data';

export type ActivityDirection = 'in' | 'out';

export interface ActivityItem {
  id: string;
  /** Counterparty. A person for payouts, a business for income. */
  party: string;
  kind: 'person' | 'business';
  direction: ActivityDirection;
  /** Signed NGN, major units. Negative is money leaving. */
  amount: number;
  /** What actually happened. Carried for the tooltip and the operator view. */
  detail: string;
  at: string;
  /**
   * Which avatar to draw, when one exists for this counterparty. Null falls
   * back to a monogram, which is what every business gets.
   */
  avatarId: string | null;
  /**
   * True when this came off the ledger rather than the opening history. The
   * interface marks these, because the distinction between "we invented this
   * so the page has something on it" and "this money actually moved" is the
   * whole argument of the project.
   */
  real: boolean;
}

// ── Spend series ──────────────────────────────────────────────────────────

export type SpendRange = 'daily' | 'weekly' | 'yearly';

export const SPEND_RANGES: SpendRange[] = ['daily', 'weekly', 'yearly'];

export const SPEND_RANGE_LABELS: Record<SpendRange, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  yearly: 'Yearly',
};

export interface SpendBucket {
  /** Start of the bucket. */
  at: string;
  /** What the callout prints under the amount. */
  label: string;
  /** Outbound NGN inside this bucket. Positive. */
  amount: number;
}

export interface SpendSeries {
  range: SpendRange;
  buckets: SpendBucket[];
  /** Summed across the window. */
  total: number;
  /** The tallest bucket, which is what the chart annotates on first paint. */
  peakIndex: number;
  /** Plain words for the window the buckets cover. */
  window: string;
}

export interface ActivityPayload {
  transactions: ActivityItem[];
  spend: Record<SpendRange, SpendSeries>;
  /** How many of the transactions are real rather than opening history. */
  realCount: number;
}

/**
 * How much of the past each range shows.
 *
 * The range names the size of one column, and the window is chosen to keep the
 * column count in the band where a dot matrix reads as a texture rather than
 * as a handful of stripes. Both are printed under the chart, so neither has to
 * be inferred from the shape.
 */
const WINDOWS: Record<SpendRange, { columns: number; window: string }> = {
  daily: { columns: 30, window: 'Last 30 days' },
  weekly: { columns: 52, window: 'Last 52 weeks' },
  yearly: { columns: 12, window: 'Last 12 months' },
};

const DAY_MS = 86_400_000;

// ── Deterministic generator ───────────────────────────────────────────────

/**
 * Mulberry32. Small, fast, and good enough for shaping a demo series.
 *
 * Seeded per calendar day rather than per position in the window. Seeding by
 * "days ago" looks identical until midnight, when every draw shifts one column
 * left and the whole twelve months of history rewrites itself. Seeding by the
 * absolute day means a date keeps the movements it has always had, and the
 * series simply gains a column.
 */
function rngFor(epochDay: number): () => number {
  let state = (epochDay * 2_654_435_761) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Round to something a payment would plausibly be, not to the kobo. */
function tidy(amount: number): number {
  return Math.round(amount / 50) * 50;
}

/**
 * Twelve months and change of invented movements.
 *
 * Long enough that the yearly range has twelve real columns to draw rather
 * than a run of zeroes with a spike at the end. Outbound goes to the
 * beneficiary book, so a row in the chart and a row in the list are about the
 * same people the rest of the app knows.
 */
function openingHistory(now: number): ActivityItem[] {
  const items: ActivityItem[] = [];
  const today = Math.floor(now / DAY_MS);

  // 400 days back, so the twelve month window is fully covered at any date.
  for (let back = 400; back >= 0; back -= 1) {
    const epochDay = today - back;
    const random = rngFor(epochDay);
    const date = new Date(epochDay * DAY_MS);
    const weekday = date.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;

    /*
     * Contractors invoice on working days. Weekends are quiet, not empty.
     *
     * Tuned dense on purpose. A dot matrix draws its argument out of texture,
     * and a series where two thirds of the days are zero does not render as a
     * quiet month, it renders as a broken chart with holes in it. Most days
     * carry something and the variance lives in the amounts instead.
     */
    const draw = random();
    const payouts = isWeekend
      ? draw < 0.42
        ? 1
        : 0
      : draw < 0.24
        ? 3
        : draw < 0.62
          ? 2
          : draw < 0.92
            ? 1
            : 0;

    /*
     * One draw for the day, then walked forward per payment, so two payouts
     * on one date are never to the same person. Drawing afresh inside the
     * loop put three invoices from the same contractor on one day often
     * enough to look like a bug in the list rather than a busy week.
     */
    const firstPick = Math.floor(random() * BENEFICIARIES.length);

    for (let n = 0; n < payouts; n += 1) {
      const who = BENEFICIARIES[(firstPick + n) % BENEFICIARIES.length];
      const band = who.rateBand;
      const amount = tidy(band[0] + random() * (band[1] - band[0]));
      const hour = 8 + Math.floor(random() * 10);
      const at = new Date(epochDay * DAY_MS + hour * 3_600_000).toISOString();

      items.push({
        id: `seed_out_${epochDay}_${n}`,
        party: who.name,
        kind: 'person',
        direction: 'out',
        amount: -amount,
        detail: `${who.role}, ${who.countryName}`,
        at,
        avatarId: who.avatarId,
        real: false,
      });
    }

    // Money in. Rarer and larger, the way client work actually pays.
    if (random() < 0.34) {
      const source = INCOME_SOURCES[Math.floor(random() * INCOME_SOURCES.length)];
      const band = source.rateBand;
      const amount = tidy(band[0] + random() * (band[1] - band[0]));
      const hour = 9 + Math.floor(random() * 8);

      items.push({
        id: `seed_in_${epochDay}`,
        party: source.name,
        kind: 'business',
        direction: 'in',
        amount,
        detail: source.detail,
        at: new Date(epochDay * DAY_MS + hour * 3_600_000).toISOString(),
        avatarId: source.avatarId,
        real: false,
      });
    }
  }

  return items;
}

// ── The real half ─────────────────────────────────────────────────────────

/**
 * A ledger entry, read as a row of activity.
 *
 * The entry carries the counterparty when whatever wrote it knew one, which
 * is every payment made since this shape existed. Entries already sitting in
 * Redis from before that do not, so the fallback names the source instead of
 * guessing a person. "Flutterwave deposit" is a true statement about an old
 * credit; inventing a payer for it would not be.
 */
function fromLedger(entry: LedgerEntry): ActivityItem {
  const outgoing = entry.direction === 'debit';

  const fallbackParty =
    entry.source === 'flutterwave'
      ? 'Flutterwave deposit'
      : outgoing
        ? 'Corridor payment'
        : 'Account credit';

  return {
    id: entry.reference,
    party: entry.party ?? fallbackParty,
    kind: entry.partyKind ?? (entry.party ? 'person' : 'business'),
    direction: outgoing ? 'out' : 'in',
    amount: outgoing ? -entry.amount : entry.amount,
    detail: entry.detail,
    at: entry.at,
    avatarId: entry.avatarId ?? null,
    real: true,
  };
}

// ── Bucketing ─────────────────────────────────────────────────────────────

/** Midnight UTC on the day an instant falls in. */
function startOfDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** Midnight UTC on the Monday of the week an instant falls in. */
function startOfWeek(ms: number): number {
  const day = startOfDay(ms);
  const weekday = new Date(day).getUTCDay();
  // Sunday is 0 in JS and the last day of the week here, so it goes back six.
  const backToMonday = (weekday + 6) % 7;
  return day - backToMonday * DAY_MS;
}

/** First of the month an instant falls in. */
function startOfMonth(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function labelFor(range: SpendRange, start: number): string {
  const date = new Date(start);

  if (range === 'daily') {
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  }

  if (range === 'weekly') {
    return `Week of ${date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })}`;
  }

  return date.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Outbound movements, summed into one column per period.
 *
 * Built from a run of empty buckets that is then filled, rather than by
 * grouping what exists. Grouping drops quiet periods entirely, and a spend
 * chart with a missing Tuesday is a chart that lies about the shape of the
 * month by making it look busier than it was.
 */
function seriesFor(items: ActivityItem[], range: SpendRange, now: number): SpendSeries {
  const { columns, window } = WINDOWS[range];

  const startOf =
    range === 'daily' ? startOfDay : range === 'weekly' ? startOfWeek : startOfMonth;

  // Walk back from the current period, so the newest column is always last.
  const starts: number[] = [];
  let cursor = startOf(now);

  for (let n = 0; n < columns; n += 1) {
    starts.unshift(cursor);
    cursor =
      range === 'yearly'
        ? startOfMonth(cursor - DAY_MS)
        : startOf(cursor - (range === 'daily' ? DAY_MS : 7 * DAY_MS));
  }

  const totals = new Map<number, number>(starts.map((start) => [start, 0]));

  for (const item of items) {
    if (item.direction !== 'out') continue;

    const at = Date.parse(item.at);
    if (!Number.isFinite(at)) continue;

    const start = startOf(at);
    const running = totals.get(start);
    if (running === undefined) continue;

    totals.set(start, running + Math.abs(item.amount));
  }

  const buckets: SpendBucket[] = starts.map((start) => ({
    at: new Date(start).toISOString(),
    label: labelFor(range, start),
    amount: Math.round(totals.get(start) ?? 0),
  }));

  let peakIndex = 0;
  for (let n = 1; n < buckets.length; n += 1) {
    if (buckets[n].amount > buckets[peakIndex].amount) peakIndex = n;
  }

  return {
    range,
    buckets,
    total: buckets.reduce((sum, bucket) => sum + bucket.amount, 0),
    peakIndex,
    window,
  };
}

// ── Assembly ──────────────────────────────────────────────────────────────

/** How many rows the dashboard list shows. */
export const RECENT_LIMIT = 6;

/**
 * Everything the dashboard reads, from one pass over one list.
 *
 * Real entries are appended to the opening history and the whole thing sorted
 * by time, so a payment made a moment ago sits at the top of the rows and
 * inside today's column at the same instant. There is no second path that
 * could disagree with the first.
 */
export function buildActivity(
  entries: LedgerEntry[],
  currency = 'NGN',
  now = Date.now(),
): ActivityPayload {
  const real = entries.filter((entry) => entry.currency === currency).map(fromLedger);

  const items = [...openingHistory(now), ...real]
    .filter((item) => Date.parse(item.at) <= now)
    .sort((a, b) => b.at.localeCompare(a.at));

  return {
    transactions: items.slice(0, RECENT_LIMIT),
    spend: {
      daily: seriesFor(items, 'daily', now),
      weekly: seriesFor(items, 'weekly', now),
      yearly: seriesFor(items, 'yearly', now),
    },
    realCount: real.length,
  };
}
