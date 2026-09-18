import { ACCOUNT } from '@/lib/demo-data';
import { accountBalance, ledger } from '@/lib/account/ledger';
import { makeReference } from '@/lib/corridor/adapters/shared';
import { quote as quoteCorridor } from '@/lib/corridor/engine';
import { registerUserWithWallet } from '@/lib/pollar/server';
import { hasTreasury, payBeneficiary, treasuryBalance } from '@/lib/stellar/treasury';
import { SETTLEMENT_ASSET, explorerTxUrl } from '@/lib/pollar/config';
import { fail, ok, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send money out of the account.
 *
 * The whole corridor in one request, and the order of the steps is the
 * important part:
 *
 *   1. quote        what the naira is worth, from the live rate
 *   2. check        the balance covers it
 *   3. debit        the naira leaves before anything is sent
 *   4. provision    a Pollar wallet for the beneficiary, server side
 *   5. deliver      KORA's treasury pays that wallet in USDC
 *   6. reverse      if step 5 failed, put the naira back
 *
 * Debiting before sending is deliberate. The other order lets two requests
 * both pass the balance check and both send, and an overdrawn account is a
 * worse failure than a reversed one. The reversal is a compensating credit
 * with its own reference rather than a deletion, because a ledger that can
 * forget is not a ledger.
 *
 * Nobody signs in to anything. The beneficiary's wallet is created through
 * Pollar's Server API, which needs no human, so a contractor in Bolivia gets a
 * real non-custodial Stellar wallet without knowing what Stellar is.
 */

const CORRIDOR = 'NG.NGN.NIP.onramp';

interface SendBody {
  recipientName?: string;
  country?: string;
  countryName?: string;
  payoutCurrency?: string;
  account?: string;
  amount?: number;
  note?: string;
}

/** Stable per beneficiary, so the same person keeps the same wallet. */
function beneficiaryKey(name: string, country: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `kora-beneficiary-${country.toLowerCase()}-${slug}`;
}

export async function POST(request: Request) {
  try {
    const body = await readJson<SendBody>(request);

    const name = body.recipientName?.trim();
    const country = body.country?.trim().toUpperCase();
    const countryName = body.countryName?.trim() || country;
    const amount = body.amount;

    if (!name) throw new Error('A recipient name is required.');
    if (!country || country.length !== 2) throw new Error('A recipient country is required.');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('An amount is required.');
    }

    if (!hasTreasury()) {
      throw new Error('No KORA treasury is configured, so nothing can be delivered.');
    }

    // ── 1. Quote ──────────────────────────────────────────────────────────
    const quote = await quoteCorridor(CORRIDOR, amount);

    // ── 2. Check the balance ──────────────────────────────────────────────
    const balance = await accountBalance(ACCOUNT.balance, ACCOUNT.currency);

    if (balance.balance < amount) {
      throw new Error(
        `Balance is ${balance.balance.toLocaleString()} ${ACCOUNT.currency}, which does not cover ${amount.toLocaleString()}.`,
      );
    }

    // Fail before taking the money if the float cannot cover the other side.
    const float = await treasuryBalance();

    if (float && float.balance < quote.receiveUsdc) {
      throw new Error(
        `KORA's treasury holds ${float.balance.toFixed(2)} ${SETTLEMENT_ASSET} and this payment needs ${quote.receiveUsdc.toFixed(2)}. Top up the float before sending.`,
      );
    }

    const reference = makeReference('KORA-PAY');

    // ── 3. Debit ──────────────────────────────────────────────────────────
    const debited = await ledger.append({
      reference,
      at: new Date().toISOString(),
      direction: 'debit',
      amount,
      currency: ACCOUNT.currency,
      detail: `Payment to ${name} in ${countryName}${body.note ? `, ${body.note}` : ''}.`,
      source: 'corridor',
    });

    if (!debited) throw new Error('That reference has already been used.');

    // ── 4. Provision the beneficiary's wallet ─────────────────────────────
    const [firstName, ...rest] = name.split(' ');

    const provisioned = await registerUserWithWallet({
      externalId: beneficiaryKey(name, country),
      firstName,
      lastName: rest.join(' ') || firstName,
    });

    if (!provisioned.ok) {
      await reverse(reference, amount, `Pollar could not provision a wallet (${provisioned.code}).`);
      throw new Error(
        `Pollar could not create a wallet for ${name}: ${provisioned.code}. The naira has been put back.`,
      );
    }

    const destination = provisioned.content.walletAddress;

    // ── 5. Deliver ────────────────────────────────────────────────────────
    const payout = await payBeneficiary(destination, quote.receiveUsdc, reference);

    if (!payout.ok) {
      await reverse(reference, amount, payout.message);
      throw new Error(`${payout.message} The naira has been put back.`);
    }

    return ok({
      reference,
      recipient: {
        name,
        country,
        countryName,
        payoutCurrency: body.payoutCurrency ?? null,
        account: body.account ?? null,
        wallet: destination,
      },
      sent: { amount, currency: ACCOUNT.currency },
      delivered: {
        amount: quote.receiveUsdc,
        asset: SETTLEMENT_ASSET,
        hash: payout.hash,
        explorer: explorerTxUrl(payout.hash),
      },
      quote,
      balanceAfter: balance.balance - amount,
    });
  } catch (err) {
    return fail(err);
  }
}

/**
 * Put the naira back.
 *
 * A separate credit carrying its own reference rather than an edit to the
 * debit, so the ledger shows that money left and came back rather than
 * pretending it never moved. Reconciling a payment that failed halfway is
 * only possible if both halves are on the record.
 */
async function reverse(reference: string, amount: number, why: string) {
  await ledger.append({
    reference: `${reference}-REVERSAL`,
    at: new Date().toISOString(),
    direction: 'credit',
    amount,
    currency: ACCOUNT.currency,
    detail: `Reversal of ${reference}. ${why}`,
    source: 'corridor',
  });
}
