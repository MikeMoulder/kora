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
 * a string in sessionStorage that any visitor could set themselves. Naming it
 * honestly keeps anyone from later mistaking it for a security boundary.
 */

const SESSION_KEY = 'kora.demo-session';

export const DEMO_CREDENTIALS = {
  email: 'ada@kora.africa',
  password: 'demo1234',
} as const;

export interface DemoSession {
  email: string;
  signedInAt: string;
}

export type SignInOutcome = { ok: true; session: DemoSession } | { ok: false; reason: string };

/**
 * Accepts anything that looks like a credential. The only rejections are
 * empty or obviously malformed input, so the form still teaches its own
 * validation rules rather than silently swallowing mistakes.
 */
export async function signInDemo(email: string, password: string): Promise<SignInOutcome> {
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

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private mode or blocked storage. Signing in still succeeds; the app
    // simply will not remember it on the next page load.
  }

  return { ok: true, session };
}

export function getDemoSession(): DemoSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as DemoSession) : null;
  } catch {
    return null;
  }
}

export function signOutDemo(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to clear if storage was never available.
  }
}
