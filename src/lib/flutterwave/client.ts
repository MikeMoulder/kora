/**
 * Flutterwave, the Nigerian collections partner.
 *
 * The NIP corridor always described the right shape and stopped short of the
 * one thing it could not invent: a licensed partner issuing a real account
 * for a real person to pay into. Its own readiness note said so. Flutterwave
 * is that partner, and its test environment issues genuine virtual accounts
 * against genuine references, so the corridor stops simulating the part that
 * matters.
 *
 * What this gives the corridor that the fixed demo account could not:
 *
 *   A per payment account number, so attribution is the account rather than a
 *   human matching a narration against a bank statement.
 *   An expiry that Flutterwave enforces, not one we print.
 *   A webhook on receipt, which replaces the operator confirmation step.
 *
 * In test mode Flutterwave pays every bank transfer itself after a few
 * seconds, so the whole corridor settles end to end without anyone moving
 * money. That is a real settlement of a real charge, not a timer we wrote.
 *
 * Server only. The secret key grants full account access and must never reach
 * the browser, which is why nothing here is prefixed `NEXT_PUBLIC_` and why
 * the module refuses to load in one.
 *
 * The guard is a runtime check rather than the `server-only` package the Next
 * docs recommend. This module is reachable from the corridor adapters, and the
 * smoke suite loads those under plain Node through tsx, where `server-only`
 * throws by design. A window check holds the same line in the browser, which
 * is the environment the rule is actually about.
 *
 * API: v3, Bearer auth, per developer.flutterwave.com as of 2026-09-18.
 */

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/flutterwave/client is server only. Importing it into a client component would ship a secret key.',
  );
}

const BASE_URL = process.env.FLW_BASE_URL ?? 'https://api.flutterwave.com/v3';

const SECRET_KEY = process.env.FLW_SECRET_KEY ?? '';

/** Set on the dashboard under Settings then Webhooks, and sent as `verif-hash`. */
const WEBHOOK_SECRET_HASH = process.env.FLW_SECRET_HASH ?? '';

/**
 * Whether the corridor should use Flutterwave at all.
 *
 * A placeholder key is worse than no key, because the corridor would announce
 * a real partner and then fail at the moment a person tries to pay.
 */
export function isFlutterwaveConfigured(): boolean {
  return SECRET_KEY.startsWith('FLWSECK') && !SECRET_KEY.includes('xxxx');
}

/** Test keys carry `_TEST`. Live money and test money must never be confused. */
export function isTestMode(): boolean {
  return SECRET_KEY.includes('_TEST');
}

export type FlutterwaveResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; status: number };

interface FlutterwaveEnvelope<T> {
  status: 'success' | 'error';
  message: string;
  data?: T;
  meta?: unknown;
}

async function call<T>(
  path: string,
  init: RequestInit,
  pick: (body: FlutterwaveEnvelope<unknown>) => T | null,
): Promise<FlutterwaveResult<T>> {
  if (!isFlutterwaveConfigured()) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      message: 'No Flutterwave secret key on the server.',
      status: 0,
    };
  }

  let response: Response;

  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${SECRET_KEY}`,
        'content-type': 'application/json',
        ...init.headers,
      },
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      code: 'NETWORK_UNREACHABLE',
      message: 'Could not reach Flutterwave.',
      status: 0,
    };
  }

  let body: FlutterwaveEnvelope<unknown> | null = null;

  try {
    body = (await response.json()) as FlutterwaveEnvelope<unknown>;
  } catch {
    return {
      ok: false,
      code: 'MALFORMED_RESPONSE',
      message: 'Flutterwave returned a body that was not JSON.',
      status: response.status,
    };
  }

  if (!response.ok || body.status !== 'success') {
    return {
      ok: false,
      code: response.status === 401 ? 'UNAUTHORIZED' : 'CHARGE_FAILED',
      message: body?.message ?? `Flutterwave answered ${response.status}.`,
      status: response.status,
    };
  }

  const picked = pick(body);

  if (picked === null) {
    return {
      ok: false,
      code: 'UNEXPECTED_SHAPE',
      message: 'Flutterwave succeeded but the payload was missing fields we need.',
      status: response.status,
    };
  }

  return { ok: true, data: picked };
}

// ── Bank transfer charge ──────────────────────────────────────────────────

export interface BankTransferChargeInput {
  /** Our own reference. The corridor's KORA-XXXXXX goes here. */
  txRef: string;
  /** Major units, as Flutterwave expects for NGN. */
  amount: number;
  email: string;
  fullname?: string;
  phoneNumber?: string;
  narration?: string;
}

/**
 * What the payer needs, lifted out of `meta.authorization`.
 *
 * `transferAmount` is deliberately kept separate from the amount we asked
 * for. Flutterwave adds its own fee to what the customer transfers, so the
 * figure a person types into their bank app is not always the figure the
 * corridor quoted, and printing the wrong one produces a payment that never
 * reconciles.
 */
export interface BankTransferCharge {
  transferReference: string;
  accountNumber: string;
  bankName: string;
  transferAmount: string;
  expiresAt: string | null;
  note: string | null;
}

interface AuthorizationShape {
  transfer_reference?: string;
  transfer_account?: string;
  transfer_bank?: string;
  transfer_amount?: string | number;
  account_expiration?: string;
  transfer_note?: string;
  mode?: string;
}

export function createBankTransferCharge(input: BankTransferChargeInput) {
  return call<BankTransferCharge>(
    '/charges?type=bank_transfer',
    {
      method: 'POST',
      body: JSON.stringify({
        tx_ref: input.txRef,
        amount: String(input.amount),
        currency: 'NGN',
        email: input.email,
        fullname: input.fullname,
        phone_number: input.phoneNumber,
        narration: input.narration,
        // A fresh account per payment. A permanent one would collect every
        // payment a person ever makes into the same number, and the corridor
        // attributes by account, not by narration.
        is_permanent: false,
      }),
    },
    (body) => {
      const auth = (body.meta as { authorization?: AuthorizationShape } | undefined)?.authorization;

      if (!auth?.transfer_account || !auth.transfer_bank) return null;

      return {
        transferReference: auth.transfer_reference ?? '',
        accountNumber: auth.transfer_account,
        bankName: auth.transfer_bank,
        transferAmount: String(auth.transfer_amount ?? input.amount),
        expiresAt: auth.account_expiration ?? null,
        note: auth.transfer_note ?? null,
      };
    },
  );
}

/**
 * Flutterwave's account expiry, as a timestamp we can actually rely on.
 *
 * It arrives looking like "2026-09-18 3:43:27 AM": no timezone, no offset, and
 * in test mode often only seconds after the charge was created. Adopting that
 * verbatim produces a funding request that is born expired, which is exactly
 * what happened the first time this ran: the corridor reported `expired` and
 * then `funded` moments later, in that order.
 *
 * So it is only adopted when it parses and still leaves a usable window.
 * Otherwise the caller keeps its own quote expiry, which is the clock the
 * state machine was built around and the one the user was quoted against.
 */
export function usableExpiry(raw: string | null, minimumMs = 60_000): string | null {
  if (!raw) return null;

  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  if (ms - Date.now() < minimumMs) return null;

  return new Date(ms).toISOString();
}

// ── Personal deposit account ──────────────────────────────────────────────

/**
 * The BVN used for static accounts in test mode.
 *
 * Flutterwave's own documentation uses 1234567890, which their API then
 * rejects with "BVN must be 11 digits long" because that example is ten
 * digits. Eleven is the real NUBAN BVN length, so the placeholder here is
 * padded to match.
 *
 * It is a placeholder either way, and only ever sent against test keys: see
 * the guard in `createPersonalDepositAccount`.
 */
const TEST_BVN = process.env.FLW_TEST_BVN ?? '12345678901';

export interface PersonalAccountInput {
  /** Stable per user. Flutterwave keys the account to it. */
  email: string;
  txRef: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  narration?: string;
  /**
   * Bank Verification Number. Required by Flutterwave for a static account,
   * and in production it comes from KYC rather than from us.
   */
  bvn?: string;
}

export interface PersonalDepositAccount {
  accountNumber: string;
  bankName: string;
  /** Flutterwave's handle for the account, needed to look it up again. */
  orderRef: string;
  flwRef: string;
  /** The name a payer sees when they check the account before sending. */
  note: string | null;
}

interface VirtualAccountShape {
  account_number?: string;
  bank_name?: string;
  order_ref?: string;
  flw_ref?: string;
  note?: string;
  expiry_date?: string;
}

/**
 * A permanent NUBAN of the account holder's own.
 *
 * This is the "static" virtual account in Flutterwave's language: no amount,
 * no expiry, reusable. It is what a personal deposit account actually is, as
 * opposed to the one-shot account the corridor opens per payment, which is
 * bound to a single quote and dies with it.
 *
 * Flutterwave requires a BVN or NIN to issue one, because a permanent
 * Nigerian account number is tied to a verified identity by regulation. We
 * have no KYC, so in test mode the documented placeholder BVN is sent and the
 * interface says the account is issued against a test identity.
 *
 * Against live keys with no real BVN this refuses outright. Sending a made up
 * BVN to a production ledger would be inventing an identity, which is a
 * different kind of wrong from a demo shortcut.
 */
export function createPersonalDepositAccount(input: PersonalAccountInput) {
  const bvn = input.bvn ?? (isTestMode() ? TEST_BVN : undefined);

  if (!bvn) {
    return Promise.resolve<FlutterwaveResult<PersonalDepositAccount>>({
      ok: false,
      code: 'BVN_REQUIRED',
      message:
        'A permanent account needs a verified BVN, which only KYC can supply. Refusing to send a placeholder against live keys.',
      status: 0,
    });
  }

  return call<PersonalDepositAccount>(
    '/virtual-account-numbers',
    {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        tx_ref: input.txRef,
        is_permanent: true,
        firstname: input.firstName,
        lastname: input.lastName,
        phonenumber: input.phoneNumber,
        narration: input.narration,
        bvn,
      }),
    },
    (body) => {
      const account = body.data as VirtualAccountShape | undefined;

      if (!account?.account_number || !account.bank_name) return null;

      return {
        accountNumber: account.account_number,
        bankName: account.bank_name,
        orderRef: account.order_ref ?? '',
        flwRef: account.flw_ref ?? '',
        note: account.note ?? null,
      };
    },
  );
}

// ── Verification ──────────────────────────────────────────────────────────

export interface VerifiedTransaction {
  id: number;
  txRef: string;
  flwRef: string;
  status: string;
  amount: number;
  currency: string;
  chargedAmount: number;
}

interface TransactionShape {
  id?: number;
  tx_ref?: string;
  flw_ref?: string;
  status?: string;
  amount?: number;
  currency?: string;
  charged_amount?: number;
}

/**
 * Confirm a transaction against Flutterwave directly.
 *
 * A webhook says what happened; this says what Flutterwave believes now. The
 * corridor credits on this, never on the webhook body alone, because a
 * webhook endpoint is a public URL and anything posted to it is a claim until
 * the issuer confirms it.
 */
export function verifyTransaction(id: number | string) {
  return call<VerifiedTransaction>(
    `/transactions/${encodeURIComponent(String(id))}/verify`,
    { method: 'GET' },
    (body) => {
      const tx = body.data as TransactionShape | undefined;

      if (!tx?.status || !tx.tx_ref) return null;

      return {
        id: tx.id ?? 0,
        txRef: tx.tx_ref,
        flwRef: tx.flw_ref ?? '',
        status: tx.status,
        amount: tx.amount ?? 0,
        currency: tx.currency ?? 'NGN',
        chargedAmount: tx.charged_amount ?? tx.amount ?? 0,
      };
    },
  );
}

/**
 * Confirm by our own reference rather than Flutterwave's transaction id.
 *
 * The webhook is the intended trigger and it needs a public URL, which
 * localhost does not have. Polling by `tx_ref` keeps the corridor completable
 * on a developer machine, using the same verification the webhook path ends
 * at, so neither route credits a payment the issuer has not confirmed.
 */
export function verifyByReference(txRef: string) {
  return call<VerifiedTransaction>(
    `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
    { method: 'GET' },
    (body) => {
      const tx = body.data as TransactionShape | undefined;

      if (!tx?.status || !tx.tx_ref) return null;

      return {
        id: tx.id ?? 0,
        txRef: tx.tx_ref,
        flwRef: tx.flw_ref ?? '',
        status: tx.status,
        amount: tx.amount ?? 0,
        currency: tx.currency ?? 'NGN',
        chargedAmount: tx.charged_amount ?? tx.amount ?? 0,
      };
    },
  );
}

// ── Webhook authentication ────────────────────────────────────────────────

/**
 * Check the `verif-hash` header against the configured secret.
 *
 * Flutterwave sends the secret itself rather than a signature over the body,
 * so this is a shared-secret check and nothing more. Compared in constant
 * time anyway: the cost is nothing and a timing oracle on a public endpoint
 * is not worth leaving open.
 *
 * Refuses when no secret is configured. An endpoint that accepts anything
 * because it was not set up is worse than one that rejects everything, since
 * it would credit a corridor payment on a stranger's POST.
 */
export function webhookSignatureValid(header: string | null): boolean {
  if (!WEBHOOK_SECRET_HASH || !header) return false;
  if (header.length !== WEBHOOK_SECRET_HASH.length) return false;

  let diff = 0;
  for (let i = 0; i < header.length; i += 1) {
    diff |= header.charCodeAt(i) ^ WEBHOOK_SECRET_HASH.charCodeAt(i);
  }

  return diff === 0;
}

export function hasWebhookSecret(): boolean {
  return WEBHOOK_SECRET_HASH.length > 0;
}
