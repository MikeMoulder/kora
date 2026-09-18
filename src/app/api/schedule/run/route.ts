import { runDuePayments } from '@/lib/schedule/runner';
import { callerOrigin } from '@/lib/payments/settle';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send everything that is due.
 *
 * The only thing that moves a scheduled payment. It is safe to call at any
 * time and from anywhere, because the work it does is decided entirely by what
 * is in the store and by the clock: nothing due means nothing happens, and the
 * report says `due: 0`.
 *
 * POST rather than GET, despite taking no body. It spends money. A GET that
 * settles payments is a GET a prefetcher, a link preview or a browser's
 * address bar can fire, and "who sent that" is not a question anybody should
 * have to ask about a corridor.
 *
 * This is the seam a cron would attach to. Vercel's scheduler hits a URL, and
 * pointing it here is the entire change. It is not wired up because the
 * duplicate-runner hazard in the Redis store is not closed, and the failure
 * that would produce is a payment delivered twice.
 */
export async function POST(request: Request) {
  try {
    const report = await runDuePayments(callerOrigin(request));
    return ok(report);
  } catch (err) {
    return fail(err);
  }
}
