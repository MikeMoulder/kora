import { ACCOUNT } from '@/lib/demo-data';
import { ledger } from '@/lib/account/ledger';
import { buildActivity } from '@/lib/account/activity';
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
 */
export async function GET() {
  try {
    return ok(buildActivity(await ledger.list(), ACCOUNT.currency));
  } catch (err) {
    return fail(err, 500);
  }
}
