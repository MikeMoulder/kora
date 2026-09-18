import { ACCOUNT } from '@/lib/demo-data';
import { accountBalance, ledger } from '@/lib/account/ledger';
import { makeReference } from '@/lib/corridor/adapters/shared';
import { quote as quoteCorridor } from '@/lib/corridor/engine';
import { hasTreasury } from '@/lib/stellar/treasury';
import { CORRIDOR, avatarIdFor } from '@/lib/payments/settle';
import { schedule, scheduleIsDurable } from '@/lib/schedule/store';

import { runnerMode } from '@/lib/schedule/runner-auth';
import { byDueDate } from '@/lib/schedule/types';
import type { ScheduledPayment } from '@/lib/schedule/types';
import { fail, ok, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled payments: the list, and making one.
 *
 * POST is the reservation half of `/api/payments` and stops there. It quotes,
 * checks the balance, debits, and writes a record of what is still owed. The
 * delivery half runs later, out of `lib/schedule/runner`.
 *
 * The naira leaves now. That is the decision the whole feature rests on and it
 * is argued in `lib/schedule/types`: a balance that still shows money already
 * promised to somebody is a balance you can spend twice, and the second spend
 * does not fail when you make it, it fails on Friday.
 *
 * The float is deliberately not checked here. An immediate send checks it
 * because it is about to spend it; a payment due on Friday would be checking a
 * balance that has three days to change, and refusing to schedule on the
 * strength of today's float would be refusing for a reason that will not be
 * true when it matters. The runner checks it at the moment it spends, and
 * reverses if it is short.
 */

interface ScheduleBody {
  recipientName?: string;
  country?: string;
  countryName?: string;
  account?: string;
  amount?: number;
  note?: string;
  /** ISO 8601. Must be in the future. */
  dueAt?: string;
  origin?: 'agent' | 'form';
}

/**
 * How far ahead a payment may be scheduled.
 *
 * A year, and the limit exists to catch a parse rather than to enforce policy.
 * A model reading "pay Carlos in 3" and producing 3000-01-01 is the failure
 * this is here for, and a payment held for a decade is money reserved out of
 * an account with nothing to show for it.
 */
const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * A due date, in the shape a person reads.
 *
 * The ledger entry this goes into is rendered straight into the activity feed,
 * and the first version put an ISO instant there: "Due
 * 2026-09-18T10:58:34.345Z." That is the same mistake the Understood as table
 * was making with the country code, in a different place. A machine timestamp
 * is the correct thing to store and the wrong thing to show.
 *
 * UTC, and it says so. This string is built on the server, where the timezone
 * is whatever the host happens to be set to and is not the reader's. Naming
 * the zone is the only version that is true for everybody; quietly formatting
 * in the server's local time would print a number that is wrong for almost
 * every reader and looks right to all of them.
 */
function humanDate(ms: number): string {
  return (
    new Date(ms).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

/**
 * How near is too near.
 *
 * Under a minute, schedule it and the runner picks it up on its next tick,
 * which is a strange thing to have asked for but not a wrong one. The refusal
 * is only for times already past, because "schedule this for yesterday" has no
 * honest reading.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<ScheduleBody>(request);

    const name = body.recipientName?.trim();
    const country = body.country?.trim().toUpperCase();
    const countryName = body.countryName?.trim() || country;
    const amount = body.amount;

    if (!name) throw new Error('A recipient name is required.');
    if (!country || country.length !== 2) throw new Error('A recipient country is required.');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('An amount is required.');
    }

    if (!body.dueAt) throw new Error('A date to send it on is required.');

    const dueAt = Date.parse(body.dueAt);
    if (!Number.isFinite(dueAt)) throw new Error('That date could not be read.');

    const now = Date.now();
    if (dueAt <= now) throw new Error('That time has already passed. Pick one in the future.');
    if (dueAt - now > MAX_AHEAD_MS) {
      throw new Error('Payments can be scheduled up to a year ahead.');
    }

    if (!hasTreasury()) {
      throw new Error('No KORA treasury is configured, so nothing could be delivered later.');
    }

    /*
     * Quoted now and thrown away, which is not waste.
     *
     * The corridor engine is what enforces the minimum and maximum a rail
     * accepts, and an amount outside them should be refused while somebody is
     * looking at the form rather than on Friday with nobody watching. The
     * figure itself is not kept: the payment will be worth what the rate says
     * when it goes, and storing today's number would invite somebody to render
     * it as a promise.
     */
    await quoteCorridor(CORRIDOR, amount);

    const balance = await accountBalance(ACCOUNT.balance, ACCOUNT.currency);

    if (balance.balance < amount) {
      throw new Error(
        `Balance is ${balance.balance.toLocaleString()} ${ACCOUNT.currency}, which does not cover ${amount.toLocaleString()}.`,
      );
    }

    const reference = makeReference('KORA-SCH');
    const when = new Date(dueAt).toISOString();

    /*
     * Debit first, record second.
     *
     * If the process dies between them the money is gone with no record, which
     * is bad and visible: the balance is short and the ledger says exactly
     * where it went. The other order loses money in the opposite direction: a
     * scheduled payment on the books that was never funded, which pays out on
     * Friday from a balance that never covered it.
     */
    const debited = await ledger.append({
      reference,
      at: new Date().toISOString(),
      direction: 'debit',
      amount,
      currency: ACCOUNT.currency,
      detail: `Held for ${name} in ${countryName}${body.note ? `, ${body.note}` : ''}. Due ${humanDate(dueAt)}.`,
      source: 'corridor',
      party: name,
      partyKind: 'person',
      avatarId: avatarIdFor(name),
    });

    if (!debited) throw new Error('That reference has already been used.');

    const payment: ScheduledPayment = {
      reference,
      createdAt: new Date().toISOString(),
      dueAt: when,
      recipient: {
        name,
        country,
        countryName: countryName ?? country,
        account: body.account?.trim() || null,
        avatarId: avatarIdFor(name),
      },
      amount,
      currency: ACCOUNT.currency,
      note: body.note?.trim() || null,
      origin: body.origin === 'agent' ? 'agent' : 'form',
      status: 'held',
      outcome: null,
    };

    const stored = await schedule.put(payment);
    if (!stored) throw new Error('That reference has already been scheduled.');

    return ok({
      payment,
      balanceAfter: balance.balance - amount,
      durable: scheduleIsDurable(),
    });
  } catch (err) {
    return fail(err);
  }
}

/**
 * Everything scheduled, and what happened to it.
 *
 * Held payments first and soonest first, because that is the list somebody
 * opens this panel to read. The finished ones follow newest first: a payment
 * that went out on Friday is a receipt, and a receipt is worth keeping visible
 * for exactly as long as somebody might go looking for the hash.
 */
export async function GET() {
  try {
    const all = await schedule.list();

    const held = all.filter((p) => p.status === 'held').sort(byDueDate);
    const done = all
      .filter((p) => p.status !== 'held')
      .sort((a, b) => (b.outcome?.at ?? b.createdAt).localeCompare(a.outcome?.at ?? a.createdAt));

    return ok({
      held,
      done,
      /** Reserved naira still waiting to be delivered. */
      heldTotal: held.reduce((total, p) => total + p.amount, 0),
      currency: ACCOUNT.currency,
      /**
       * Whether the list survives a restart. The panel says so, because a
       * scheduled payment that disappears when the dev server reloads is the
       * kind of thing that gets discovered during a demo.
       */
      durable: scheduleIsDurable(),
      /**
       * What is expected to fire due payments here.
       *
       * `dashboard` means the browser polls, which is the development default
       * and a real limitation. `cron` means a runner secret is set, so the
       * browser cannot call the route and something external is expected to.
       *
       * Expected, not confirmed. If the secret is set and nobody wired the
       * timer up, payments sit held. The panel says a scheduler is expected
       * rather than that one is running, because this cannot tell the
       * difference and should not imply it can.
       */
      runner: runnerMode(),
    });
  } catch (err) {
    return fail(err);
  }
}
