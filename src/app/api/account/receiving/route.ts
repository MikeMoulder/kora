import { ACCOUNT } from '@/lib/demo-data';
import {
  createPersonalDepositAccount,
  isFlutterwaveConfigured,
  isTestMode,
  type PersonalDepositAccount,
} from '@/lib/flutterwave/client';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The account holder's own deposit account.
 *
 * A permanent NUBAN issued by Flutterwave and keyed to this person, which is
 * a different object from the one-shot account the corridor opens per
 * payment. That one is bound to a single quote and dies with it; this one is
 * theirs, it has no amount and no expiry, and anybody can pay into it at any
 * time.
 *
 * Issued once and reused. A personal account number that changed between page
 * loads would be worse than useless: somebody saves it, pays into it a week
 * later, and the money lands nowhere anyone is looking.
 */

interface ReceivingAccount {
  provider: 'flutterwave' | 'simulated';
  mode: 'test' | 'live' | 'simulated';
  accountNumber: string;
  bankName: string;
  accountName: string;
  rail: string;
  /**
   * True when the account is real but the identity behind it is not. Flutterwave
   * requires a BVN for a permanent account; without KYC we send the documented
   * test one, and the interface has to say so rather than imply a verified
   * person stands behind the number.
   */
  testIdentity: boolean;
  note: string | null;
}

/**
 * Cached for the life of the server process.
 *
 * Not durable, and the limit is worth stating plainly: a second instance
 * issues a second account, so a deployment that scales out hands different
 * people different numbers for the same user. A real build stores the
 * `orderRef` against the user and looks it up. That needs a database, which
 * this does not have yet.
 */
let cached: ReceivingAccount | null = null;

/** Concurrent first loads must not each create an account. */
let inFlight: Promise<ReceivingAccount> | null = null;

/** The fallback, when Flutterwave is not configured or declines. */
function simulated(): ReceivingAccount {
  return {
    provider: 'simulated',
    mode: 'simulated',
    accountNumber: ACCOUNT.receiving.accountNumber,
    bankName: ACCOUNT.receiving.bankName,
    accountName: ACCOUNT.receiving.accountName,
    rail: ACCOUNT.receiving.rail,
    testIdentity: false,
    note: null,
  };
}

function toReceiving(account: PersonalDepositAccount): ReceivingAccount {
  return {
    provider: 'flutterwave',
    mode: isTestMode() ? 'test' : 'live',
    accountNumber: account.accountNumber,
    bankName: account.bankName,
    accountName: ACCOUNT.receiving.accountName,
    rail: ACCOUNT.receiving.rail,
    testIdentity: isTestMode(),
    note: account.note,
  };
}

async function issue(): Promise<ReceivingAccount> {
  if (!isFlutterwaveConfigured()) return simulated();

  const result = await createPersonalDepositAccount({
    // Both are derived from the account holder rather than generated, so a
    // retry after a crash asks Flutterwave about the same person instead of
    // opening a second account for them.
    email: `${ACCOUNT.firstName.toLowerCase()}.${ACCOUNT.fullName.split(' ').pop()?.toLowerCase()}@kora.test`,
    txRef: `kora-deposit-${ACCOUNT.fullName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    firstName: ACCOUNT.firstName,
    lastName: ACCOUNT.fullName.split(' ').slice(1).join(' ') || ACCOUNT.firstName,
    narration: `KORA - ${ACCOUNT.fullName}`,
  });

  if (!result.ok) return simulated();

  return toReceiving(result.data);
}

export async function GET() {
  try {
    if (cached) return ok(cached);

    // Share one in-flight creation rather than racing several.
    inFlight ??= issue();

    const account = await inFlight;
    inFlight = null;

    // Only a real account is worth caching. Caching the fallback would pin the
    // app to it for the rest of the process even after a key is added.
    if (account.provider === 'flutterwave') cached = account;

    return ok(account);
  } catch (err) {
    inFlight = null;
    return fail(err, 502);
  }
}
