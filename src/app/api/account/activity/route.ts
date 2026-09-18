import { ACCOUNT } from '@/lib/demo-data';
import { ledger } from '@/lib/account/ledger';
import { buildActivity } from '@/lib/account/activity';
import { receiptsByReference } from '@/lib/payments/receipt-store';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Recent activity and the outbound spend series.
 *
 * Both from one call, because both are views of the same list and splitting
 * them into two endpoints would mean two reads of the ledger that could
 * return different things. The chart and the rows are always talking about
 * the same set of movements.
 *
 * Served rather than computed in the component. The opening history is
 * anchored to the current instant, so generating it in a client component
 * would produce one series during the server render and a different one at
 * hydration. Keeping the clock on the server side of the boundary makes the
 * question moot.
 *
 * Built twice, which is not waste. The first pass is what decides which
 * references are worth asking the receipt store about: the feed is capped, and
 * reading a receipt for a payment that fell off the end of the list would be a
 * round trip for a row nobody can open. The second pass is the same pure
 * function over the same entries with the receipts filled in, so the two
 * cannot disagree about anything else.
 */
export async function GET() {
  try {
    const entries = await ledger.list();

    // One clock for both passes. Two calls to `Date.now()` a round trip apart
    // could disagree about a row dated this instant, and the row that appears
    // only in the second pass is the one with no receipt to show for itself.
    const now = Date.now();

    const rows = buildActivity(entries, ACCOUNT.currency, now);
    const receipts = await receiptsByReference(rows.transactions.map((tx) => tx.id));

    return ok(buildActivity(entries, ACCOUNT.currency, now, receipts));
  } catch (err) {
    return fail(err, 500);
  }
}
