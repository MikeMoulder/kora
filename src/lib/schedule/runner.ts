/**
 * What actually sends a scheduled payment.
 *
 * The money is already gone from the balance, reserved when the payment was
 * scheduled. So this is the delivery half and nothing else, which is `settle`
 * from `lib/payments`, plus the bookkeeping that records what came back.
 *
 * There is no cron, and that is a scope decision rather than an oversight, so
 * it is worth being plain about. The runner is triggered by the dashboard,
 * which asks once on load and then on an interval while it is open. A payment
 * due at three in the morning with nobody's browser open goes out when
 * somebody next opens the dashboard, and the interface says "due now" rather
 * than pretending it already went.
 *
 * Turning that into a real cron is one Vercel config entry pointed at the same
 * route, and the route is written so that is all it would take. What is not
 * free is correctness with two runners firing at once, which the Redis store's
 * own comment covers.
 *
 * Server only. `settle` holds the treasury signer.
 */

import 'server-only';

import { settle } from '@/lib/payments/settle';
import { schedule } from './store';
import { duePayments } from './types';

export interface RunResult {
  reference: string;
  name: string;
  status: 'sent' | 'failed';
  hash: string | null;
  message: string | null;
}

export interface RunReport {
  /** How many were due when the tick started. */
  due: number;
  sent: number;
  failed: number;
  results: RunResult[];
}

/**
 * Send everything that is due.
 *
 * Sequential, not `Promise.all`. Every payment spends from one shared treasury
 * float and provisions a wallet through one upstream, so four at once means
 * four concurrent claims on a balance that was checked against one of them.
 * The float check inside `settle` only means anything if the payments take
 * their turns.
 *
 * Failures are recorded rather than dropped. A scheduled payment that fails
 * has already had its naira returned by `settle`, and the record is what lets
 * the panel say "this did not go, and here is why" instead of the payment
 * quietly vanishing from the list.
 */
export async function runDuePayments(origin: string, now = Date.now()): Promise<RunReport> {
  const due = duePayments(await schedule.list(), now);
  const report: RunReport = { due: due.length, sent: 0, failed: 0, results: [] };

  for (const payment of due) {
    /*
     * Claimed before it is attempted, and claimed as failed.
     *
     * Moving it out of `held` first means a second tick arriving while this
     * one is mid-delivery finds nothing due. Claiming afterwards would leave a
     * window the whole length of a Stellar settlement in which the same
     * payment is still eligible to be sent again.
     *
     * It is claimed as `failed` and corrected to `sent`, rather than the other
     * way around. If the process dies between the claim and the outcome, what
     * is left in the store says the payment did not go. That is the safer of
     * the two wrong answers to leave behind: it is the one somebody checks.
     */
    const claimed = await schedule.transition(payment.reference, 'held', 'failed', {
      at: new Date().toISOString(),
      hash: null,
      explorer: null,
      delivered: null,
      message: 'Delivery started and did not report back.',
    });

    // Cancelled between the list and here, or another tick got there first.
    if (!claimed) continue;

    const result = await settle({
      reference: payment.reference,
      name: payment.recipient.name,
      country: payment.recipient.country,
      countryName: payment.recipient.countryName,
      account: payment.recipient.account ?? undefined,
      amount: payment.amount,
      note: payment.note ?? undefined,
      origin,
    });

    const at = new Date().toISOString();

    /*
     * `failed` to whatever happened.
     *
     * The `from` is `failed` rather than `held` because the claim above is
     * what put it there. Only the runner holding that claim can name it
     * correctly, which is the whole point of naming both ends.
     */
    await schedule.transition(
      payment.reference,
      'failed',
      result.ok ? 'sent' : 'failed',
      result.ok
        ? {
            at,
            hash: result.delivered.hash,
            explorer: result.delivered.explorer,
            delivered: { amount: result.delivered.amount, asset: result.delivered.asset },
            message: null,
          }
        : { at, hash: null, explorer: null, delivered: null, message: result.message },
    );

    if (result.ok) {
      report.sent += 1;
      report.results.push({
        reference: payment.reference,
        name: payment.recipient.name,
        status: 'sent',
        hash: result.delivered.hash,
        message: null,
      });
    } else {
      report.failed += 1;
      report.results.push({
        reference: payment.reference,
        name: payment.recipient.name,
        status: 'failed',
        hash: null,
        message: result.message,
      });
    }
  }

  return report;
}
