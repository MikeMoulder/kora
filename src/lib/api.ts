/**
 * Shared helpers for the route handlers.
 *
 * `fail()` deliberately distinguishes a corridor that is not executable from a
 * generic error: the UI shows the blocker verbatim, which is only possible if
 * the reason survives the HTTP boundary.
 */

import { NextResponse } from 'next/server';
import { CorridorNotExecutable } from './corridor/adapters/planned';

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(err: unknown, fallbackStatus = 400) {
  if (err instanceof CorridorNotExecutable) {
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        code: 'CORRIDOR_NOT_EXECUTABLE',
        corridorId: err.corridorId,
        blocker: err.blocker,
      },
      { status: 409 },
    );
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';
  return NextResponse.json({ ok: false, error: message }, { status: fallbackStatus });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('Request body must be JSON.');
  }
}
