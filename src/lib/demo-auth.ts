'use client';

/**
 * Simulated sign in.
 *
 * There is no account system and there is not meant to be one. This exists so
 * the sign in screen leads somewhere and the app can tell whether someone came
 * through the front door, nothing more.
 *
 * Deliberately not called `auth`. Nothing here authenticates anybody: no
 * password is checked, no request leaves the browser, and the session flag is
 * a cookie any visitor could set themselves. Naming it honestly keeps anyone
 * from later mistaking it for a security boundary.
 *
 * The flag moved from sessionStorage to a cookie when the dashboard went
 * behind a gate. The gate runs in `src/proxy.ts`, on the server, before any of
 * this code exists, and sessionStorage is invisible there. A cookie is the one
 * piece of browser state the server is handed on every request, so it is the
 * only version of this flag a proxy can act on.
 */

import { DEMO_SESSION_COOKIE, readSessionCookie, type DemoSession } from './demo-session';

/** Thirty days for "remember me". Without it the cookie dies with the browser. */
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30;

export const DEMO_CREDENTIALS = {
  email: 'ada@kora.africa',
  password: 'demo1234',
} as const;

export type { DemoSession };

export type SignInOutcome = { ok: true; session: DemoSession } | { ok: false; reason: string };

/**
 * Accepts anything that looks like a credential. The only rejections are
 * empty or obviously malformed input, so the form still teaches its own
 * validation rules rather than silently swallowing mistakes.
 */
export async function signInDemo(
  email: string,
  password: string,
  remember = false,
): Promise<SignInOutcome> {
  const trimmed = email.trim();

  if (!trimmed || !password) {
    return { ok: false, reason: 'Enter an email address and a password.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, reason: 'That does not look like an email address.' };
  }

  // A short pause so the pending state is visible rather than flashing past.
  await new Promise((resolve) => setTimeout(resolve, 550));

  const session: DemoSession = { email: trimmed, signedInAt: new Date().toISOString() };
  writeSessionCookie(session, remember);

  return { ok: true, session };
}

export function getDemoSession(): DemoSession | null {
  return typeof document === 'undefined' ? null : readSessionCookie(document.cookie);
}

export function signOutDemo(): void {
  if (typeof document === 'undefined') return;

  // Same Path the cookie was written with. A delete aimed at a different path
  // silently does nothing and leaves somebody signed in after clicking out.
  document.cookie = `${DEMO_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function writeSessionCookie(session: DemoSession, remember: boolean): void {
  const value = encodeURIComponent(JSON.stringify(session));
  const lifetime = remember ? `; Max-Age=${REMEMBER_MAX_AGE}` : '';

  // SameSite=Lax so a top level navigation back into the app still carries it.
  // No Secure flag: the demo has to work over plain http on localhost, and
  // there is nothing in here worth protecting in transit.
  document.cookie = `${DEMO_SESSION_COOKIE}=${value}; Path=/; SameSite=Lax${lifetime}`;
}
