'use client';

/**
 * Typed fetchers for the KORA API, plus the client-side safety net for the
 * funding store.
 *
 * Every funding request the browser creates is also kept in `sessionStorage`.
 * If a status call 404s because it landed on a serverless instance that never
 * saw the reference, we re-seed that instance and retry once. The alternative
 * is a demo that dies on a cold start in front of a judge.
 */

import type { KoraCorridor, KoraFundingRequest, KoraFundingState, KoraQuote } from './corridor/types';
import type { IntentResult } from './intent/types';
import type { Resolution } from './intent/resolve';
import type { CountryGroup, PollarCorridorRow } from './corridor/registry';
import type { PollarRail } from './corridor/pollar-shapes';

const STORAGE_KEY = 'kora.funding';

export class ApiError extends Error {
  readonly code?: string;
  readonly blocker?: string;
  readonly status: number;

  constructor(message: string, status: number, code?: string, blocker?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.blocker = blocker;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  const body = (await res.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: string; code?: string; blocker?: string }
    | null;

  if (!res.ok || !body || body.ok === false) {
    throw new ApiError(
      body && 'error' in body ? body.error : `Request failed (${res.status})`,
      res.status,
      body && 'code' in body ? body.code : undefined,
      body && 'blocker' in body ? body.blocker : undefined,
    );
  }

  return body.data;
}

export interface IntentResponse extends IntentResult {
  resolution: Resolution;
}

export function parseIntent(text: string) {
  return call<IntentResponse>('/api/intent', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export interface CoverageResponse {
  countries: CountryGroup[];
  coverage: {
    koraCorridors: number;
    koraExecutable: number;
    koraCountries: number;
    pollarCorridors: number;
    pollarCountries: number;
    pollarAfricanCorridors: number;
  };
  koraRails: string[];
  pollarRails: PollarRail[];
  pollarCorridors: PollarCorridorRow[];
  adapters: { id: string; displayName: string; settlementNote: string; corridorCount: number }[];
}

export function getCoverage() {
  return call<CoverageResponse>('/api/corridors');
}

export interface QuoteResponse {
  quote: KoraQuote;
  destinationEstimate: { currency: string; amount: number; rate: number; source: string };
}

export function getQuote(corridorId: string, amount: number) {
  return call<QuoteResponse>('/api/quote', {
    method: 'POST',
    body: JSON.stringify({ corridorId, amount }),
  });
}

export async function createFunding(corridorId: string, quote: KoraQuote) {
  const request = await call<KoraFundingRequest>('/api/funding', {
    method: 'POST',
    body: JSON.stringify({ corridorId, quote }),
  });
  remember(request);
  return request;
}

export async function getFundingStatus(
  reference: string,
): Promise<{ state: KoraFundingState; request: KoraFundingRequest | null }> {
  try {
    return await call('/api/funding/' + reference);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404 && (await reseed(reference))) {
      return call('/api/funding/' + reference);
    }
    throw err;
  }
}

export async function reportPayment(reference: string) {
  try {
    return await call<KoraFundingState>(`/api/funding/${reference}/report`, { method: 'POST' });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404 && (await reseed(reference))) {
      return call<KoraFundingState>(`/api/funding/${reference}/report`, { method: 'POST' });
    }
    throw err;
  }
}

export async function confirmFunding(reference: string) {
  try {
    return await call<KoraFundingState>(`/api/funding/${reference}/confirm`, { method: 'POST' });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404 && (await reseed(reference))) {
      return call<KoraFundingState>(`/api/funding/${reference}/confirm`, { method: 'POST' });
    }
    throw err;
  }
}

/** Corridor list, without needing the whole coverage payload. */
export async function getCorridors(): Promise<KoraCorridor[]> {
  const coverage = await getCoverage();
  return coverage.countries.flatMap((c) => c.corridors);
}

// ── sessionStorage safety net ────────────────────────────────────────────

function remember(request: KoraFundingRequest) {
  try {
    const all = load();
    all[request.reference] = request;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Private mode or a full quota. The demo still works on a warm instance.
  }
}

function load(): Record<string, KoraFundingRequest> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

async function reseed(reference: string): Promise<boolean> {
  const request = load()[reference];
  if (!request) return false;

  try {
    await call('/api/funding/rehydrate', {
      method: 'POST',
      body: JSON.stringify({ request }),
    });
    return true;
  } catch {
    return false;
  }
}
