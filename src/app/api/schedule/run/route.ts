import { runDuePayments } from '@/lib/schedule/runner';
import { authoriseRunner } from '@/lib/schedule/runner-auth';
import { callerOrigin } from '@/lib/payments/settle';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send everything that is due.
 *
 * The only thing that moves a scheduled payment. Safe to call at any time and
 * from anywhere authorised, because the work it does is decided entirely by
 * what is in the store and by the clock: nothing due means nothing happens and
 * the report says `due: 0`.
 *
 * POST rather than GET, despite taking no body. It spends money, and a GET
 * that settles payments is one a prefetcher, a link preview or a browser's
 * address bar can fire.
 *
 * Guarded by a shared secret, which is what turns the duplicate-delivery
 * hazard in the Redis store from a real risk into an unreachable one: a secret
 * cannot be given to a browser, so a configured deployment has exactly one
 * caller. `lib/schedule/runner-auth` has the whole argument.
 */
export async function POST(request: Request) {
  try {
    const auth = authoriseRunner(request);

    if (!auth.ok) {
      /*
       * 401 and a reason, by hand rather than through `fail`.
       *
       * `fail` answers 400 for everything, which is the right default for a
       * bad request body and the wrong answer for a credential: a cron that
       * gets 400 looks like it sent malformed input, and whoever set it up
       * goes looking at the wrong thing. The reason names the header and never
       * quotes the expected value.
       */
      return Response.json({ ok: false, error: auth.why }, { status: 401 });
    }

    const report = await runDuePayments(callerOrigin(request));

    /*
     * The report says who ran it.
     *
     * A settled payment is worth being able to trace back to the thing that
     * triggered it, and `open` appearing in a production log is the signal
     * that this deployment never got its secret.
     */
    return ok({ ...report, ranBy: auth.by });
  } catch (err) {
    return fail(err);
  }
}
