/**
 * The shape of the demo session flag, readable from either side.
 *
 * Kept apart from `demo-auth` on purpose. That file is `'use client'`, because
 * signing in and out is browser work, and the gate in `src/proxy.ts` runs on
 * the server where a client module has no business being imported. Both need
 * to agree on one cookie name and one format, so the agreement lives here and
 * neither side owns a private copy of it.
 *
 * Nothing in here authenticates anybody. The cookie is not signed and not
 * HttpOnly, so any visitor could write one by hand. It records that somebody
 * came through the front door, which is all the app claims.
 */

export const DEMO_SESSION_COOKIE = 'kora.demo-session';

export interface DemoSession {
  email: string;
  signedInAt: string;
}

/**
 * Pulls the session out of a raw cookie header.
 *
 * Takes the header as an argument rather than reaching for `document`, so the
 * proxy can hand it `request.headers.get('cookie')` and the browser can hand
 * it `document.cookie`. Never throws: a cookie truncated by hand, or left over
 * from an older shape, means "not signed in" rather than a crashed request.
 */
export function readSessionCookie(cookieHeader: string | null | undefined): DemoSession | null {
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEMO_SESSION_COOKIE}=`));

  if (!match) return null;

  try {
    const parsed: unknown = JSON.parse(
      decodeURIComponent(match.slice(DEMO_SESSION_COOKIE.length + 1)),
    );

    if (typeof parsed !== 'object' || parsed === null) return null;
    const session = parsed as Partial<DemoSession>;

    return typeof session.email === 'string' && session.email
      ? { email: session.email, signedInAt: session.signedInAt ?? '' }
      : null;
  } catch {
    return null;
  }
}
