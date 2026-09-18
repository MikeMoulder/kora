/**
 * The last mile: USDC in a Pollar wallet, out as bolivianos.
 *
 * This is the one leg of the corridor KORA does not execute, and the reason
 * is design rather than time. Two facts, both verified against the live API
 * rather than read off a page:
 *
 *   1. `/ramps/*` refuses KORA's publishable key with SDK_AUTH_INVALID_TOKEN.
 *      The key itself is valid, which the readiness probe proves by using it
 *      against `/v2/applications/config` on the same host. What the ramp wants
 *      is the *end user's* session. Pollar's own wording for the endpoint is
 *      "funds will be sent from the user's wallet to the provided bank
 *      account", and the transaction lookup adds "only the authenticated user
 *      who created the transaction can access it".
 *
 *      That is correct behaviour and KORA should not want it any other way. A
 *      non-custodial wallet whose funder can also drain it is a custodial
 *      wallet with extra steps. The beneficiary owns the off-ramp.
 *
 *   2. Stereum, Pollar's Bolivian anchor, is mainnet only. On testnet there is
 *      no BOB anchor to call even with a correct session.
 *
 * So this module does the honest thing: it computes what the beneficiary would
 * receive at the live rate, builds the exact request body Pollar documents,
 * and then actually attempts the call so the refusal is recorded evidence
 * rather than a claim in a comment. Everything it returns is marked simulated.
 *
 * What it must never do is invent a transaction id, a status of "completed" or
 * an anchor reference. A mocked payout that looks real is worse than no payout
 * at all, because the first person to trust it is the one being paid.
 */

import 'server-only';

import { POLLAR_PUBLISHABLE_KEY } from './config';
import { POLLAR_CORRIDORS } from '../corridor/registry';
import { usdcToBob } from '../corridor/rates';

/** Where the SDK-scoped ramp endpoints live. */
const SDK_BASE = process.env.POLLAR_SDK_API_URL ?? 'https://sdk.api.pollar.xyz/v1';

/**
 * The body `POST /ramps/offramp` takes, transcribed from `@pollar/core`
 * 0.11.3 rather than paraphrased, so the shape stays checkable against the
 * package that is actually installed.
 */
export interface OfframpRequest {
  /** From `GET /ramps/quote`. Valid 15 minutes. */
  quoteId: string;
  amount: number;
  currency: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  walletAddress?: string;
  fullName?: string;
  bankDetails?: {
    type: 'CLABE' | 'PIX' | 'PSE' | 'ACH' | 'BREB';
    value: string;
  };
}

/** What we learned by asking, rather than by assuming. */
export interface OfframpProbe {
  endpoint: string;
  status: number;
  /** Pollar's error code, which is the part worth quoting. */
  code: string;
}

export interface SimulatedPayout {
  /** Never anything else. The word is load bearing. */
  mode: 'simulated';

  /** What actually landed in the beneficiary's wallet, on chain, for real. */
  delivered: { amount: number; asset: string };

  /** What they would receive locally. */
  payout: { amount: number; currency: string };

  rate: { perUsd: number; source: string; asOf: string; stale: boolean };

  /** Who Pollar would route this through. */
  anchor: {
    provider: string;
    rail: string;
    country: string;
    countryName: string;
  };

  /** The call KORA would make, with a placeholder where the quote id goes. */
  request: OfframpRequest;

  /** Why it stops here, and the evidence for it. */
  blocked: {
    reasons: string[];
    probe: OfframpProbe | null;
  };
}

/**
 * Ask Pollar for a real off-ramp quote and record what comes back.
 *
 * Expected to fail, and the failure is the point: an interface that says "we
 * could not do this" is only trustworthy if something actually tried. Short
 * timeout and a null return on any transport problem, because a demo must not
 * hang on a call whose answer it already expects.
 *
 * The `Origin` header is what makes the answer worth recording, and leaving it
 * off cost a run to notice. `sdk.api.pollar.xyz` checks the app's allowed
 * origins before it checks anything else, so a server-to-server call with no
 * Origin is turned away at the door with 403 ORIGIN_NOT_ALLOWED. That is a
 * true statement about CORS and says nothing about who may run an off-ramp.
 * Sending the app's real origin gets the request past the door to the decision
 * this module is actually citing: 401 SDK_AUTH_INVALID_TOKEN, meaning the
 * application key is not a user session.
 */
async function probeRampQuote(amount: number, origin: string): Promise<OfframpProbe | null> {
  const endpoint = `${SDK_BASE}/ramps/quote?country=BO&amount=${amount}&currency=BOB&direction=offramp`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        'x-pollar-api-key': POLLAR_PUBLISHABLE_KEY,
        origin,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });

    const body = (await response.json().catch(() => null)) as { code?: string } | null;

    return {
      endpoint: '/ramps/quote?country=BO&currency=BOB&direction=offramp',
      status: response.status,
      code: body?.code ?? String(response.status),
    };
  } catch {
    // Unreachable, timed out, or not JSON. The reasons below still hold.
    return null;
  }
}

/** Pollar's Bolivian sell-side anchor, read from the registry rather than typed here. */
function bolivianAnchor() {
  const row = POLLAR_CORRIDORS.find(
    (c) => c.country === 'BO' && c.direction.includes('Sell'),
  );

  return {
    provider: row?.provider ?? 'Stereum',
    rail: row?.rail ?? 'ACH',
    country: 'BO',
    countryName: row?.countryName ?? 'Bolivia',
  };
}

/**
 * The final mile, simulated and labelled.
 *
 * `usdc` is the amount that genuinely arrived on chain, so the boliviano
 * figure is derived from a real delivery at a live rate. Only the execution is
 * missing, and the object says exactly which part that is.
 */
export async function simulateBolivianPayout({
  usdc,
  asset,
  recipientName,
  wallet,
  account,
  origin,
}: {
  usdc: number;
  asset: string;
  recipientName: string;
  wallet: string;
  /** Whatever the sender typed. Shown back, never validated by KORA. */
  account?: string;
  /**
   * The app's own origin, which has to be one Pollar allows or the probe
   * never reaches the question it is asking.
   */
  origin: string;
}): Promise<SimulatedPayout> {
  const { bob, rate } = await usdcToBob(usdc);
  const anchor = bolivianAnchor();
  const probe = await probeRampQuote(usdc, origin);

  const reasons = [
    'Pollar scopes /ramps to the end user. The off-ramp moves money out of the beneficiary’s own wallet, so it needs their session, not KORA’s application key. A wallet whose funder can also empty it is not non-custodial.',
    `${anchor.provider}, Pollar’s Bolivian anchor, is mainnet only. On testnet there is no BOB anchor to call even with the right session.`,
  ];

  return {
    mode: 'simulated',
    delivered: { amount: usdc, asset },
    payout: { amount: bob, currency: 'BOB' },
    rate: {
      perUsd: rate.perUsd,
      source: rate.source,
      asOf: rate.asOf,
      stale: rate.stale,
    },
    anchor,
    request: {
      // The one field KORA cannot fill in, because it comes from a call it
      // cannot make. Named rather than faked.
      quoteId: '<from GET /ramps/quote, 15 minute expiry>',
      amount: usdc,
      currency: 'BOB',
      country: 'BO',
      walletAddress: wallet,
      fullName: recipientName,
      bankDetails: account ? { type: 'ACH', value: account } : undefined,
    },
    blocked: { reasons, probe },
  };
}
