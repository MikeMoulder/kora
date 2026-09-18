import { NextResponse, type NextRequest } from 'next/server';
import { readSessionCookie } from '@/lib/demo-session';

/**
 * The gate in front of the dashboard.
 *
 * Called proxy rather than middleware because Next 16 renamed the convention.
 * Same file, same job, same position: it runs on the server before a route is
 * rendered, which is the only place a redirect can happen without the browser
 * first painting the page it is being sent away from.
 *
 * It enforces one rule in both directions. No session and you get the sign in
 * form, whatever you asked for. A session and the sign in form sends you on to
 * the dashboard, because a signed in person landing on a login screen has to
 * work out for themselves that they are already through.
 *
 * What this is not: a security boundary. The cookie it reads is unsigned and
 * writable from the console, so this stops somebody skipping the front door,
 * not somebody determined to. `src/lib/demo-session.ts` says the same thing at
 * more length. The real protection this project needs is on the corridor
 * routes that move money, and those authenticate against Pollar and the
 * Flutterwave webhook signature rather than against anything here.
 *
 * Deliberately no ?next= round trip. The dashboard is the only protected route
 * there is, so remembering where somebody was heading would be ceremony around
 * a single destination.
 */

const SIGN_IN = '/';
const DASHBOARD = '/dashboard';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Read the cookie header rather than request.cookies, so the one parser in
  // demo-session decides what a valid session looks like and this file cannot
  // drift away from what the browser writes.
  const session = readSessionCookie(request.headers.get('cookie'));

  const wantsDashboard = pathname === DASHBOARD || pathname.startsWith(`${DASHBOARD}/`);

  if (wantsDashboard && !session) {
    return NextResponse.redirect(new URL(SIGN_IN, request.url));
  }

  if (pathname === SIGN_IN && session) {
    return NextResponse.redirect(new URL(DASHBOARD, request.url));
  }

  return NextResponse.next();
}

/*
 * Only the two routes that have a rule.
 *
 * The documented alternative is one negative pattern excluding _next, the API
 * and every static extension, which runs this on every request in the app to
 * answer "not my problem" almost every time. Naming the pair is cheaper and
 * cannot accidentally swallow an asset or an API route: the funding webhook in
 * particular arrives from Flutterwave with no cookie at all and must never be
 * redirected into a sign in page.
 */
export const config = {
  matcher: ['/', '/dashboard/:path*'],
};
