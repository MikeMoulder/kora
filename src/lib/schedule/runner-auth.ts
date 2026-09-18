/**
 * Who is allowed to make payments happen.
 *
 * `POST /api/schedule/run` settles every payment that has fallen due. It
 * cannot send money that was not already scheduled and reserved, so it is not
 * a way to drain the treasury, but it does decide *when* payments fire. An
 * open one lets a stranger pick that moment, and "who ran that" is not a
 * question anybody should have to ask about a corridor.
 *
 * So the route takes a shared secret. Two consequences follow, and the second
 * is the one that improves the product rather than just locking a door.
 *
 * **The browser cannot call it any more.** There is no way to give a web page
 * a secret: anything prefixed `NEXT_PUBLIC_` is shipped to every visitor in
 * the bundle. The demo session cookie is not an alternative either, because it
 * is unsigned and not HttpOnly and `lib/demo-session` says so in as many
 * words: any visitor can write one by hand. Accepting it here would be a lock
 * with the key taped to it.
 *
 * **Which means a configured deployment has exactly one runner.** That is the
 * fix for the duplicate-delivery hazard in the Redis store rather than a
 * workaround for it. The unlocked read, check, write can only go wrong with
 * two runners firing at once; one cron on one host, wrapped in `flock`, makes
 * that unreachable rather than merely unlikely.
 *
 * With no secret set, the route stays open and the dashboard drives it. That
 * is the local development path and the interface says which mode it is in,
 * because a scheduler that quietly is not running is worse than one that says
 * it is not.
 */

import 'server-only';
import { timingSafeEqual } from 'node:crypto';

export const RUNNER_HEADER = 'x-kora-runner';

const SECRET = process.env.KORA_RUNNER_SECRET ?? '';

/**
 * A placeholder is worse than nothing, because it looks configured.
 *
 * The same rule `hasServerKey` applies to the Pollar secret. A deployment that
 * copied `.env.example` verbatim has a secret whose value is the word telling
 * you to replace it, and it should be treated as absent rather than as a
 * password every reader of the repository knows.
 */
export function hasRunnerSecret(): boolean {
  return SECRET.length >= 16 && !SECRET.includes('replace-me');
}

/**
 * Who the caller is, or why they are nobody.
 *
 * Returns a reason rather than a boolean so the route can answer 401 with
 * something a person setting up a cron can act on. The reasons deliberately
 * never quote the expected value.
 */
export type RunnerAuth =
  | { ok: true; by: 'secret' | 'open' }
  | { ok: false; why: string };

export function authoriseRunner(request: Request): RunnerAuth {
  const supplied = request.headers.get(RUNNER_HEADER);

  if (!hasRunnerSecret()) {
    /*
     * Unconfigured, and a supplied header still fails.
     *
     * Accepting any header when no secret is set would mean a deployment that
     * forgot the environment variable passes every request that bothers to
     * send one, which is the failure mode of every "auth is optional" check
     * ever written. Open means open to everybody equally, and the interface
     * is told so it can say it out loud.
     */
    if (supplied) {
      return {
        ok: false,
        why: 'This deployment has no KORA_RUNNER_SECRET set, so it cannot check that header.',
      };
    }

    return { ok: true, by: 'open' };
  }

  if (!supplied) {
    return { ok: false, why: `Missing ${RUNNER_HEADER}.` };
  }

  return safeEqual(supplied, SECRET)
    ? { ok: true, by: 'secret' }
    : { ok: false, why: `Bad ${RUNNER_HEADER}.` };
}

/**
 * Constant time comparison.
 *
 * `a === b` on a secret leaks its length and, over enough requests, its
 * contents: string comparison returns at the first differing byte, so a guess
 * sharing a longer prefix takes measurably longer. It is a remote timing
 * attack over a network on a hackathon project, which is to say wildly
 * impractical, and it is also two lines to not have.
 *
 * `timingSafeEqual` throws when the buffers differ in length, which would
 * itself be a length oracle, so the lengths are compared first and the result
 * folded in rather than returned early.
 */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length) {
    // Still do the work, so a wrong length is not the fast path.
    timingSafeEqual(left, left);
    return false;
  }

  return timingSafeEqual(left, right);
}

/**
 * What drives the runner here, for the interface to render.
 *
 * `cron` does not mean a cron is definitely running. It means this deployment
 * is configured to expect one and the dashboard has therefore stopped
 * polling. If the secret is set and nobody wired the timer up, payments sit
 * held, which is why the panel says "a scheduler is expected" rather than "a
 * scheduler is running". It cannot know the difference and should not claim
 * to.
 */
export function runnerMode(): 'cron' | 'dashboard' {
  return hasRunnerSecret() ? 'cron' : 'dashboard';
}
