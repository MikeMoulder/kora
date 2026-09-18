/**
 * Pollar Server API client.
 *
 * The SDK in the browser and this are two different doors into Pollar, and
 * they fail for different reasons. The browser SDK talks to
 * `sdk.api.pollar.xyz` with the publishable key and is checked against the
 * app's allowed origins, so an app with an empty Domains list gets
 * `ORIGIN_NOT_ALLOWED` on every call including the very first config fetch.
 * This one talks to `server.api.pollar.xyz` with the secret key and is not
 * origin checked at all.
 *
 * That difference is worth the module. It means the corridor can register a
 * beneficiary with Pollar from a route handler while the dashboard is still
 * unconfigured, and it means the app can tell a person which setting is
 * missing instead of leaving a 403 in the console for them to find.
 *
 * Server only. The secret key must never be imported into a client component,
 * which is why nothing here is prefixed `NEXT_PUBLIC_`.
 *
 * Verified against the live testnet API rather than the docs alone:
 *   POST /v1/users            201 SERVER_USER_REGISTERED
 *   POST /v1/users/with-wallet 201 SERVER_USER_WALLET_CREATED, once the
 *                             reserve wallet is funded; 502
 *                             WALLET_CREATION_FAILED while it is empty
 *   POST /v1/tokens/verify    401 SDK_AUTH_INVALID_TOKEN on a bogus token
 */

import 'server-only';

const BASE_URL = process.env.POLLAR_SERVER_API_URL ?? 'https://server.api.pollar.xyz/v1';

const SECRET_KEY = process.env.POLLAR_SECRET_KEY ?? '';

/** A placeholder is worse than nothing, because it looks configured. */
export function hasServerKey(): boolean {
  return SECRET_KEY.startsWith('sec_') && !SECRET_KEY.includes('xxxx');
}

/**
 * Pollar wraps every response, success or failure, in the same envelope. The
 * HTTP status carries the status; the body carries a code and nothing else on
 * an error. Both shapes are modelled so a caller never has to guess.
 */
interface PollarSuccess<T> {
  content: T;
  code: string;
  success: true;
}

interface PollarFailure {
  code: string;
  success: false;
  details?: unknown;
}

export type PollarResult<T> =
  | { ok: true; code: string; content: T }
  | { ok: false; code: string; status: number; details?: unknown };

/**
 * One request.
 *
 * Returns a result rather than throwing, because every interesting outcome
 * here is a fact about the app's configuration rather than a bug: an unfunded
 * reserve wallet and a missing trustline are both ordinary answers that the
 * caller needs to render, not exceptions to swallow.
 */
async function call<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<PollarResult<T>> {
  if (!hasServerKey()) {
    return { ok: false, code: 'NO_SECRET_KEY', status: 0 };
  }

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'x-pollar-api-key': SECRET_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
      // Nothing here is cacheable: these are writes and live probes.
      cache: 'no-store',
    });
  } catch {
    return { ok: false, code: 'NETWORK_UNREACHABLE', status: 0 };
  }

  let payload: PollarSuccess<T> | PollarFailure | null = null;

  try {
    payload = (await response.json()) as PollarSuccess<T> | PollarFailure;
  } catch {
    // A non-JSON body from a gateway is still a failure, just an opaque one.
    return { ok: false, code: 'MALFORMED_RESPONSE', status: response.status };
  }

  if (payload && payload.success === true) {
    return { ok: true, code: payload.code, content: payload.content };
  }

  return {
    ok: false,
    code: payload?.code ?? 'UNKNOWN_ERROR',
    status: response.status,
    details: (payload as PollarFailure | null)?.details,
  };
}

// ── Users ─────────────────────────────────────────────────────────────────

export interface PollarUserInput {
  /** Your own id for this person, 1 to 255 characters. */
  externalId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

export interface RegisteredUser {
  userId: string;
  externalId: string;
}

export interface RegisteredUserWithWallet extends RegisteredUser {
  /**
   * The provisioned Stellar account.
   *
   * Named `walletAddress` and not `wallet.publicKey`. That is what the live
   * testnet API returns, checked against a real 201 rather than inferred from
   * the wallets section of the docs, which identifies wallets by public key
   * everywhere else.
   */
  walletAddress: string;
  /** True once the reserve is sponsored and the account exists on-chain. */
  funded: boolean;
}

/** Register a person against the app. No wallet, no on-chain footprint. */
export function registerUser(user: PollarUserInput, signal?: AbortSignal) {
  return call<RegisteredUser>('/users', user, signal);
}

/**
 * Register a person and provision a Stellar wallet in the same call.
 *
 * Needs the app's funding wallet to hold XLM, because provisioning is a
 * sponsored `createAccount` paid for by that wallet. Without it this answers
 * `WALLET_CREATION_FAILED`, which reads like a transient Stellar problem and
 * is usually an empty treasury.
 */
export function registerUserWithWallet(user: PollarUserInput, signal?: AbortSignal) {
  return call<RegisteredUserWithWallet>('/users/with-wallet', user, signal);
}

// ── Wallets ───────────────────────────────────────────────────────────────

export interface FundedWallet {
  publicKey: string;
  startingBalance: string;
}

/**
 * Activate a custodial wallet on-chain.
 *
 * Idempotent from the caller's side: `WALLET_ALREADY_FUNDED` means the wallet
 * is active, which is the outcome that was wanted.
 */
export function fundWallet(publicKey: string, signal?: AbortSignal) {
  return call<FundedWallet>('/wallets/fund', { publicKey }, signal);
}

// ── Tokens ────────────────────────────────────────────────────────────────

export interface VerifiedToken {
  userId: string;
  applicationId: string;
  expiresAt: string;
  network: string;
  wallet?: { publicKey: string };
}

/**
 * Check an end-user token minted by the browser SDK.
 *
 * Also the cheapest honest reachability probe there is: it authenticates the
 * secret key and creates nothing, so a deliberately invalid token answering
 * `SDK_AUTH_INVALID_TOKEN` proves the key and the API are both good.
 */
export function verifyToken(token: string, signal?: AbortSignal) {
  return call<VerifiedToken>('/tokens/verify', { token }, signal);
}
