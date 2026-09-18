/**
 * FX rates.
 *
 * Every rate KORA shows is fetched live and carries its source and timestamp.
 * Nothing in the payment path uses a number that the UI cannot attribute — the
 * product promise is "no black-box exchange rate", and that has to be true of
 * the demo too.
 *
 * Source: open.er-api.com (exchangerate-api.com free tier, keyless, refreshed
 * daily). These are interbank mid-market rates. For NGN in particular the
 * street/parallel rate diverges from this; we label the source rather than
 * quietly pick whichever number flatters the demo.
 */

const FEED = 'https://open.er-api.com/v6/latest/USD';
const SOURCE_LABEL = 'exchangerate-api.com · interbank mid-market';

/**
 * Pinned fallback, captured 2026-09-17T00:02:31Z from the feed above.
 * Used only when the feed is unreachable, and the UI says so when it is.
 */
const PINNED: Record<string, number> = {
  NGN: 1327.882853,
  KES: 129.577086,
  GHS: 11.447901,
  UGX: 3794.171905,
  ZAR: 16.32417,
  BOB: 11.308599,
  TZS: 2647.085263,
  XOF: 570.221538,
  USD: 1,
};
const PINNED_AS_OF = '2026-09-17T00:02:31Z';

export interface RateQuote {
  /** Units of `currency` per 1 USD. USDC is treated as 1:1 with USD. */
  perUsd: number;
  currency: string;
  source: string;
  asOf: string;
  /** True when the live feed failed and the pinned snapshot was used. */
  stale: boolean;
}

interface CacheEntry {
  rates: Record<string, number>;
  asOf: string;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

/** Cache for an hour — the upstream feed only moves once a day. */
const TTL_MS = 60 * 60 * 1000;

async function load(): Promise<CacheEntry> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(FEED, {
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 3600 },
      });
      if (!res.ok) throw new Error(`rate feed ${res.status}`);
      const json = (await res.json()) as {
        result: string;
        rates: Record<string, number>;
        time_last_update_utc: string;
      };
      if (json.result !== 'success' || !json.rates?.USD) throw new Error('rate feed malformed');
      cache = {
        rates: json.rates,
        asOf: new Date(json.time_last_update_utc).toISOString(),
        fetchedAt: Date.now(),
      };
      return cache;
    } catch {
      cache = { rates: PINNED, asOf: PINNED_AS_OF, fetchedAt: Date.now() };
      return cache;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export async function getRate(currency: string): Promise<RateQuote> {
  const code = currency.toUpperCase();
  const entry = await load();
  const live = entry.rates[code];
  const stale = entry.rates === PINNED || live === undefined;
  const perUsd = live ?? PINNED[code];

  if (perUsd === undefined) {
    throw new Error(`No FX rate available for ${code}`);
  }

  return {
    perUsd,
    currency: code,
    source: stale ? `${SOURCE_LABEL} (cached snapshot)` : SOURCE_LABEL,
    asOf: stale ? PINNED_AS_OF : entry.asOf,
    stale,
  };
}

/** Convenience for the Bolivia display leg. */
export async function usdcToBob(usdc: number): Promise<{ bob: number; rate: RateQuote }> {
  const rate = await getRate('BOB');
  return { bob: round2(usdc * rate.perUsd), rate };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round7(n: number): number {
  return Math.round(n * 1e7) / 1e7;
}
