/**
 * The account's activity: what moved, when, and which way.
 *
 * This replaces the two hardcoded arrays the dashboard used to read from. It
 * is built from two halves:
 *
 *   opening history  invented, deterministic, five years deep
 *   ledger entries   real movements, from the corridor and from Flutterwave
 *
 * They do not reach the same places. The rows the interface lists are real
 * movements and nothing else, because a transaction list is a claim about
 * money that moved and an invented row in it is a false one however carefully
 * it is labelled. The opening history stays behind the spend chart, which is
 * asking a different question: what does a year of this account look like.
 * A shape is allowed to be illustrative in a way a receipt is not.
 *
 * Both halves still come off one sorted list, which is what keeps them
 * honest about each other: a payment made a moment ago sits at the top of the
 * rows and inside today's column at the same instant, because there is only
 * one set of facts underneath both.
 *
 * Nothing here is generated with `Math.random`. The opening history comes out
 * of a seeded generator, so the same day produces the same history on every
 * restart, on every machine, and in every process. A demo whose chart
 * reshuffles between two page loads is worse than one that does not, and a
 * history that differs between the server and the client is a hydration bug.
 */

import type { LedgerEntry } from './ledger';
import type { PaymentReceipt } from '@/lib/payments/receipt';
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
   * True when this came off the ledger rather than the opening history.
   *
   * Every item the payload lists has this set. It is kept as a field rather
   * than dropped because the two halves share one list on the way to the
   * spend chart, and this is what `buildActivity` filters the rows on.
   */
  real: boolean;
  /**
   * Who told us this movement happened, carried straight off the ledger.
   *
   * Only real entries have one, which is every entry that reaches the rows.
   * The opening history was invented by this file and has no source, which is
   * one more reason it is not something to list as a movement.
   */
  source?: LedgerEntry['source'];
  /**
   * What settlement left behind, for a payment that was sent on the spot.
   *
   * Joined on the reference rather than stored on the entry, because the debit
   * is written before the money is sent and the ledger is append-only. There
   * is nothing to go back and amend, so the half that is only known afterwards
   * lives in its own record and is read alongside.
   *
   * Absent on deposits, on reversals, on scheduled payments, which carry the
   * same facts in the schedule store, and on every payment made before
   * receipts existed. The detail panel shows what is here and says nothing
   * where there is nothing.
   */
  receipt?: PaymentReceipt;
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
  /** What one column covers, for the chart to name its own window. */
  unit: 'day' | 'week' | 'month';
  /** Oldest first. */
  buckets: SpendBucket[];
}

export interface ActivityPayload {
  /**
   * Real movements, newest first, capped at `HISTORY_LIMIT`. The card shows
   * the first few. Opening history is not in here; it only shapes `spend`.
   */
  transactions: ActivityItem[];
  spend: Record<SpendRange, SpendSeries>;
  /**
   * How many real movements the account has, before `HISTORY_LIMIT` takes the
   * newest few. Zero is the honest answer on a cold start, and the interface
   * says so rather than filling the list with movements nobody made.
   */
  realCount: number;
}

/**
 * How far back each range is built.
 *
 * Deliberately more than any one screen draws. The chart runs the full width
 * of the dashboard now, so the number of columns that fits is a property of
 * the window rather than of the data: a wide monitor has room for three months
 * of days, a phone for four weeks of them. Sending the long series and letting
 * the chart take the tail it can draw at a sensible pitch is the only version
 * that is dense on both, and it costs a few hundred small numbers over the
 * wire.
 */
const WINDOWS: Record<SpendRange, { columns: number; unit: 'day' | 'week' | 'month' }> = {
  daily: { columns: 90, unit: 'day' },
  weekly: { columns: 104, unit: 'week' },
  yearly: { columns: 60, unit: 'month' },
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
 * Five years and change of invented movements, for the spend chart alone.
 *
 * Long enough that the yearly range has sixty real columns to draw rather
 * than a run of zeroes with a spike at the end. None of this is listed as a
 * transaction: it exists so the chart has a year of shape behind it, which is
 * a statement about the account's rhythm rather than about any one payment.
 */
function openingHistory(now: number): ActivityItem[] {
  const items: ActivityItem[] = [];
  const today = Math.floor(now / DAY_MS);

  /*
   * Five years and a bit, so the longest window is fully covered at any date
   * rather than trailing off into empty columns at its left edge.
   */
  for (let back = 1900; back >= 0; back -= 1) {
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
 * The entry carries the counterparty when whatever wrote it knew one, which is
 * every payment made since that became a field. Older entries do not, so the
 * name is recovered from the wording and, failing that, the rail is named
 * rather than a person invented.
 */
function fromLedger(entry: LedgerEntry, receipt?: PaymentReceipt): ActivityItem {
  const outgoing = entry.direction === 'debit';
  const derived = partyFromDetail(entry);
  const recovered = {
    party: entry.party ?? derived.party,
    kind: entry.partyKind ?? derived.kind,
  };

  return {
    id: entry.reference,
    party: recovered.party,
    kind: recovered.kind,
    direction: outgoing ? 'out' : 'in',
    amount: outgoing ? -entry.amount : entry.amount,
    detail: entry.detail,
    at: entry.at,
    avatarId: entry.avatarId ?? avatarIdFor(recovered.party),
    real: true,
    source: entry.source,
    ...(receipt ? { receipt } : {}),
  };
}

/**
 * Read the counterparty back out of an older entry's wording.
 *
 * Entries written before the party was a field still say who they were for,
 * in a sentence this code produced and therefore knows the shape of. Parsing
 * it back recovers a real name for every payment already on the ledger,
 * which is the difference between a demo whose history reads "Corridor
 * payment" six times and one that reads like an account.
 *
 * It is a fallback, not a parser to build on. Anything that does not match
 * falls through to naming the rail, which is a true statement about the
 * movement. Guessing a person from a sentence that did not contain one would
 * not be.
 */
function partyFromDetail(entry: LedgerEntry): { party: string; kind: 'person' | 'business' } {
  // "Payment to Carlos Mamani in Bolivia, logo and brand system."
  const payment = /^Payment to (.+?) in [^,.]+[,.]/.exec(entry.detail);
  if (payment) return { party: payment[1], kind: 'person' };

  if (entry.detail.startsWith('Reversal of ')) {
    return { party: 'Reversed payment', kind: 'business' };
  }

  if (entry.source === 'flutterwave' || entry.detail.includes('Flutterwave')) {
    return { party: 'Flutterwave deposit', kind: 'business' };
  }

  return entry.direction === 'debit'
    ? { party: 'Corridor payment', kind: 'business' }
    : { party: 'Account credit', kind: 'business' };
}

/** The saved beneficiary's portrait, when the counterparty is one of them. */
function avatarIdFor(party: string): string | null {
  const wanted = party.trim().toLowerCase();
  return BENEFICIARIES.find((b) => b.name.toLowerCase() === wanted)?.avatarId ?? null;
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
  const { columns, unit } = WINDOWS[range];

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

  return { range, unit, buckets };
}

// ── Assembly ──────────────────────────────────────────────────────────────

/**
 * How many rows the dashboard card shows.
 *
 * Four, because the list stands beside the balance card rather than in a
 * column of its own, and the two read as a pair only while they are close to
 * the same height. Everything older is one click away under View all.
 */
export const RECENT_LIMIT = 4;

/**
 * How many the feed actually carries.
 *
 * Enough for the full list in the workspace panel, which is where View all
 * goes. Sent in the same response as the card's four rather than fetched again
 * when the panel opens: the rows are already computed, they are small, and a
 * second request for a list the server has just built in memory would be a
 * round trip to save about two kilobytes.
 *
 * A ceiling rather than a target. The list is as long as the account's real
 * history and no longer.
 */
export const HISTORY_LIMIT = 30;

/**
 * Everything the dashboard reads, from one pass over one list.
 *
 * Real entries are appended to the opening history and the whole thing sorted
 * by time, so a payment made a moment ago sits at the top of the rows and
 * inside today's column at the same instant. There is no second path that
 * could disagree with the first.
 *
 * The rows are then filtered down to the real half. The chart is not, because
 * the two are answering different questions and only one of them is a list of
 * things that happened.
 */
export function buildActivity(
  entries: LedgerEntry[],
  currency = 'NGN',
  now = Date.now(),
  /**
   * Receipts by reference, when the caller has read them.
   *
   * Passed in rather than fetched, so this stays a pure function of what it is
   * given and the route keeps the only await. An empty map is the honest
   * default: every row still renders, exactly as it did before receipts
   * existed.
   */
  receipts: Record<string, PaymentReceipt> = {},
): ActivityPayload {
  const real = entries
    .filter((entry) => entry.currency === currency)
    .map((entry) => fromLedger(entry, receipts[entry.reference]));

  const items = [...openingHistory(now), ...real]
    .filter((item) => Date.parse(item.at) <= now)
    .sort((a, b) => b.at.localeCompare(a.at));

  return {
    transactions: items.filter((item) => item.real).slice(0, HISTORY_LIMIT),
    spend: {
      daily: seriesFor(items, 'daily', now),
      weekly: seriesFor(items, 'weekly', now),
      yearly: seriesFor(items, 'yearly', now),
    },
    realCount: real.length,
  };
}
