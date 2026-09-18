/**
 * Checks on the activity feed.
 *
 * The feed is the one place where invented history and real movements are
 * merged, and merges are where things go quietly wrong: a payment lands in the
 * list but not the chart, or in the wrong bucket, or twice. These assert the
 * joins rather than the arithmetic.
 *
 * Nothing here touches Flutterwave, the treasury or Pollar. Entries are handed
 * to `buildActivity` directly, which is the same thing the route does after
 * reading the ledger, so the path under test is the real one and it costs
 * nothing to run.
 *
 *   npm run probe:activity
 */

import { buildActivity } from '../src/lib/account/activity';
import type { LedgerEntry } from '../src/lib/account/ledger';

let ran = 0;
let failed = 0;

function check(what: string, got: unknown, want: unknown) {
  ran += 1;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

function assert(what: string, ok: boolean) {
  check(what, ok, true);
}

const NOW = Date.parse('2026-09-18T12:00:00Z');

/** The injected row, found by its reference rather than by where it landed. */
function row(payload: ReturnType<typeof buildActivity>, id: string) {
  const found = payload.transactions.find((t) => t.id === id);
  if (!found) throw new Error(`No row for ${id}. The feed dropped it.`);
  return found;
}

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    reference: 'TEST-1',
    // Dated at the instant the feed is built, so an injected entry always
    // outranks the opening history, whose movements land on the hour.
    at: new Date(NOW).toISOString(),
    direction: 'debit',
    amount: 250_000,
    currency: 'NGN',
    detail: 'Payment to Carlos Mamani in Bolivia, logo and brand system.',
    source: 'corridor',
    ...over,
  };
}

// ── Shape of the opening history ──────────────────────────────────────────

console.log('\nopening history');

const base = buildActivity([], 'NGN', NOW);

check('six rows in the list', base.transactions.length, 6);
check('nothing real yet', base.realCount, 0);
check('three ranges', Object.keys(base.spend).sort(), ['daily', 'weekly', 'yearly']);
check('daily columns', base.spend.daily.buckets.length, 30);
check('weekly columns', base.spend.weekly.buckets.length, 52);
check('yearly columns', base.spend.yearly.buckets.length, 12);

assert(
  'rows are newest first',
  base.transactions.every((t, n) => n === 0 || t.at <= base.transactions[n - 1].at),
);
assert('no row is dated in the future', base.transactions.every((t) => Date.parse(t.at) <= NOW));
assert('every range is populated', Object.values(base.spend).every((s) => s.total > 0));
assert(
  'peak is the tallest column',
  Object.values(base.spend).every(
    (s) => s.buckets[s.peakIndex].amount === Math.max(...s.buckets.map((b) => b.amount)),
  ),
);
assert(
  'the same clock gives the same history',
  JSON.stringify(buildActivity([], 'NGN', NOW)) === JSON.stringify(base),
);

// ── A real payment reaches both views ─────────────────────────────────────

console.log('\na real debit');

const withDebit = buildActivity([entry()], 'NGN', NOW);
const top = row(withDebit, 'TEST-1');

check('it is the newest row', withDebit.transactions[0].id, 'TEST-1');
check('it names the recipient', top.party, 'Carlos Mamani');
check('it is marked real', top.real, true);
check('it is signed out', top.amount, -250_000);
check('it carries the portrait', top.avatarId, 'carlos-mamani');
check('one real row counted', withDebit.realCount, 1);

const dailyDelta =
  withDebit.spend.daily.buckets.at(-1)!.amount - base.spend.daily.buckets.at(-1)!.amount;
const weeklyDelta =
  withDebit.spend.weekly.buckets.at(-1)!.amount - base.spend.weekly.buckets.at(-1)!.amount;
const yearlyDelta =
  withDebit.spend.yearly.buckets.at(-1)!.amount - base.spend.yearly.buckets.at(-1)!.amount;

check("today's column rose by the payment", dailyDelta, 250_000);
check('this week rose by the same', weeklyDelta, 250_000);
check('this month rose by the same', yearlyDelta, 250_000);

// ── A credit moves the list but not the spend ─────────────────────────────

console.log('\na real credit');

const withCredit = buildActivity(
  [entry({ reference: 'TEST-2', direction: 'credit', detail: 'Deposit confirmed by Flutterwave, ref FLW-1.', source: 'flutterwave' })],
  'NGN',
  NOW,
);

check('it is named for the rail', row(withCredit, 'TEST-2').party, 'Flutterwave deposit');
check('it is signed in', row(withCredit, 'TEST-2').direction, 'in');
check(
  'it does not touch outbound spend',
  withCredit.spend.daily.total,
  base.spend.daily.total,
);

// ── Recovering a counterparty from older wording ──────────────────────────

console.log('\nolder entries');

const recovered = buildActivity([entry({ party: undefined, avatarId: undefined })], 'NGN', NOW);
check('name read back out of the detail', row(recovered, 'TEST-1').party, 'Carlos Mamani');
check('and matched to a portrait', row(recovered, 'TEST-1').avatarId, 'carlos-mamani');

const unparseable = buildActivity(
  [entry({ party: undefined, detail: 'Something else entirely.' })],
  'NGN',
  NOW,
);
check(
  'an unreadable one names the rail, not a person',
  row(unparseable, 'TEST-1').party,
  'Corridor payment',
);

const reversal = buildActivity(
  [entry({ party: undefined, direction: 'credit', detail: 'Reversal of KORA-PAY-1. Pollar was down.' })],
  'NGN',
  NOW,
);
check('a reversal says so', row(reversal, 'TEST-1').party, 'Reversed payment');

// ── Things that must not reach the feed ───────────────────────────────────

console.log('\nfiltering');

const otherCurrency = buildActivity([entry({ currency: 'USD' })], 'NGN', NOW);
check('another currency is ignored', otherCurrency.realCount, 0);

const tooOld = buildActivity(
  [entry({ at: new Date(NOW - 500 * 86_400_000).toISOString() })],
  'NGN',
  NOW,
);
check(
  'an entry older than every window changes no column',
  tooOld.spend.yearly.total,
  base.spend.yearly.total,
);
check('but it is still counted as real', tooOld.realCount, 1);

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${ran - failed}/${ran} checks passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
