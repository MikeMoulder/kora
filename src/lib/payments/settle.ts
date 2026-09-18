/**
 * The half of a payment that happens after the naira has already gone.
 *
 * Extracted from `/api/payments` because a scheduled payment needs exactly
 * this and nothing else. The two halves of a send have different lifetimes
 * once payments can be held:
 *
 *   reserve   quote, check the balance, debit          happens when you ask
 *   settle    provision, deliver, price the last mile  happens when it is due
 *
 * For an immediate payment those are a millisecond apart and the split is
 * invisible. For one scheduled for Friday they are days apart, and the second
 * half has to run without a request, without a session and without the person
 * who asked for it being anywhere near a browser.
 *
 * So this takes a reference that has already been debited and finishes the
 * job. It never touches the balance except to put money back when it fails,
 * which is the one thing both callers need to behave identically.
 *
 * Server only. It holds the treasury signer.
 */

import 'server-only';

import { ACCOUNT, BENEFICIARIES } from '@/lib/demo-data';
import { ledger } from '@/lib/account/ledger';
import { quote as quoteCorridor } from '@/lib/corridor/engine';
import { registerUserWithWallet } from '@/lib/pollar/server';
import { hasTreasury, payBeneficiary, treasuryBalance } from '@/lib/stellar/treasury';
import { simulateBolivianPayout } from '@/lib/pollar/offramp';
import { SETTLEMENT_ASSET, explorerTxUrl } from '@/lib/pollar/config';
import type { SimulatedPayout } from '@/lib/pollar/offramp';

/** The funding corridor every payment in this app is funded from. */
export const CORRIDOR = 'NG.NGN.NIP.onramp';

export interface SettleInput {
  /** The reference the debit was written under. Carried, never re-issued. */
  reference: string;
  name: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  countryName: string;
  account?: string;
  payoutCurrency?: string | null;
  /** Major units of `ACCOUNT.currency`, already debited. */
  amount: number;
  note?: string;
  /** The caller's origin, for the ramp probe's own origin check. */
  origin: string;
}

export interface SettleSuccess {
  ok: true;
  recipient: {
    name: string;
    country: string;
    countryName: string;
    payoutCurrency: string | null;
    account: string | null;
    wallet: string;
  };
  sent: { amount: number; currency: string };
  delivered: { amount: number; asset: string; hash: string; explorer: string };
  payout: SimulatedPayout;
  quote: Awaited<ReturnType<typeof quoteCorridor>>;
}

export interface SettleFailure {
  ok: false;
  /** Safe to show a person. The naira is already back by the time this returns. */
  message: string;
  /** Whether the debit was reversed. False only when there was nothing to reverse. */
  reversed: boolean;
}

export type SettleResult = SettleSuccess | SettleFailure;

/**
 * Finish a payment whose naira has already left the balance.
 *
 * Every failure path reverses before returning, so a caller that gets
 * `ok: false` knows the account is whole without having to do anything about
 * it. That is the property the scheduled runner depends on: it fires with
 * nobody watching, and a runner that has to remember to clean up is a runner
 * that will eventually not.
 *
 * Quoted here rather than passed in, and deliberately. A payment scheduled on
 * Monday for Friday is worth what the rate says on Friday. Carrying Monday's
 * quote forward would be a quietly invented number, and the difference between
 * the two is exactly the thing a currency corridor exists to be honest about.
 */
export async function settle(input: SettleInput): Promise<SettleResult> {
  const { reference, name, country, countryName, amount, origin } = input;

  if (!hasTreasury()) {
    await reverse(reference, amount, 'No KORA treasury is configured.');
    return {
      ok: false,
      reversed: true,
      message: 'No KORA treasury is configured, so nothing could be delivered.',
    };
  }

  const quote = await quoteCorridor(CORRIDOR, amount);

  /*
   * The float is checked here rather than only at reserve time, because for a
   * scheduled payment those are different days and the float moves in between.
   * Failing now costs a reversal; failing after `payBeneficiary` has partially
   * gone through would cost considerably more.
   */
  const float = await treasuryBalance();

  if (float && float.balance < quote.receiveUsdc) {
    await reverse(
      reference,
      amount,
      `Treasury holds ${float.balance.toFixed(2)} ${SETTLEMENT_ASSET}, needed ${quote.receiveUsdc.toFixed(2)}.`,
    );
    return {
      ok: false,
      reversed: true,
      message:
        `KORA's treasury holds ${float.balance.toFixed(2)} ${SETTLEMENT_ASSET} and this payment ` +
        `needs ${quote.receiveUsdc.toFixed(2)}. The naira has been put back.`,
    };
  }

  const [firstName, ...rest] = name.split(' ');

  const provisioned = await provisionWallet({
    externalId: beneficiaryKey(name, country),
    firstName,
    lastName: rest.join(' ') || firstName,
  });

  if (!provisioned.ok) {
    await reverse(reference, amount, `Pollar could not provision a wallet (${provisioned.code}).`);
    return {
      ok: false,
      reversed: true,
      message: `Pollar could not create a wallet for ${name}: ${provisioned.code}. The naira has been put back.`,
    };
  }

  const destination = provisioned.content.walletAddress;

  const delivery = await payBeneficiary(destination, quote.receiveUsdc, reference);

  if (!delivery.ok) {
    await reverse(reference, amount, delivery.message);
    return {
      ok: false,
      reversed: true,
      message: `${delivery.message} The naira has been put back.`,
    };
  }

  /*
   * The last mile, priced but not executed.
   *
   * Computed after delivery rather than alongside the quote, because the
   * boliviano figure should describe USDC that actually arrived. Quoting it up
   * front would have printed a payout for a transfer that might still have
   * been reversed two steps later.
   */
  const payout = await simulateBolivianPayout({
    usdc: quote.receiveUsdc,
    asset: SETTLEMENT_ASSET,
    recipientName: name,
    wallet: destination,
    account: input.account?.trim() || undefined,
    origin,
  });

  return {
    ok: true,
    recipient: {
      name,
      country,
      countryName,
      payoutCurrency: input.payoutCurrency ?? null,
      account: input.account ?? null,
      wallet: destination,
    },
    sent: { amount, currency: ACCOUNT.currency },
    delivered: {
      amount: quote.receiveUsdc,
      asset: SETTLEMENT_ASSET,
      hash: delivery.hash,
      explorer: explorerTxUrl(delivery.hash),
    },
    payout,
    quote,
  };
}

/**
 * Provision the beneficiary's wallet, with retries.
 *
 * `WALLET_CREATION_FAILED` really is transient sometimes. An identical call
 * that failed once succeeded twice in a row moments later, and by then the
 * payment had already been reversed. Losing somebody's transfer to a flaky
 * upstream is a worse outcome than waiting three seconds.
 *
 * Retrying is safe because the call is idempotent on `externalId`: Pollar
 * returns the same user and the same wallet rather than making a second one,
 * which is verified behaviour and not an assumption.
 */
async function provisionWallet(user: {
  externalId: string;
  firstName: string;
  lastName: string;
}) {
  let last = await registerUserWithWallet(user);

  for (let attempt = 0; attempt < 2 && !last.ok; attempt += 1) {
    if (last.code !== 'WALLET_CREATION_FAILED') break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    last = await registerUserWithWallet(user);
  }

  return last;
}

/**
 * Put the naira back.
 *
 * A separate credit carrying its own reference rather than an edit to the
 * debit, so the ledger shows that money left and came back rather than
 * pretending it never moved. Reconciling a payment that failed halfway is only
 * possible if both halves are on the record.
 *
 * Exported because cancelling a scheduled payment needs the same movement for
 * a different reason: the money was reserved days ago and is being released
 * rather than recovered from a failure. Same entry, different sentence.
 */
export async function reverse(reference: string, amount: number, why: string) {
  await ledger.append({
    reference: `${reference}-REVERSAL`,
    at: new Date().toISOString(),
    direction: 'credit',
    amount,
    currency: ACCOUNT.currency,
    detail: `Reversal of ${reference}. ${why}`,
    source: 'corridor',
    party: 'Reversed payment',
    partyKind: 'business',
  });
}

/**
 * The saved beneficiary's portrait, when the recipient is one of them.
 *
 * Matched on the name, which is the only thing a send is guaranteed to carry:
 * a payment can be composed by hand, by the agent, or off the beneficiary
 * book, and only the last of those knows an id. Anybody not in the book gets a
 * monogram, which is the correct answer rather than a fallback.
 */
export function avatarIdFor(name: string): string | null {
  const wanted = name.trim().toLowerCase();
  return BENEFICIARIES.find((b) => b.name.toLowerCase() === wanted)?.avatarId ?? null;
}

/** Stable per beneficiary, so the same person keeps the same wallet. */
export function beneficiaryKey(name: string, country: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `kora-beneficiary-${country.toLowerCase()}-${slug}`;
}

/**
 * The origin this request arrived on.
 *
 * Passed through to the ramp probe, which Pollar checks against the app's
 * allowed origins before it checks anything else. Taken from the request
 * rather than from a constant for the same reason the readiness probe does it:
 * a guess that happens to be wrong turns a meaningful 401 into a meaningless
 * 403.
 */
export function callerOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  if (origin) return origin;

  const host = request.headers.get('host') ?? 'localhost:3000';
  const proto =
    request.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
