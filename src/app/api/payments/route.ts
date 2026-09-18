import { ACCOUNT } from '@/lib/demo-data';
import { accountBalance, ledger } from '@/lib/account/ledger';
import { makeReference } from '@/lib/corridor/adapters/shared';
import { quote as quoteCorridor } from '@/lib/corridor/engine';
import { hasTreasury, treasuryBalance } from '@/lib/stellar/treasury';
import { SETTLEMENT_ASSET } from '@/lib/pollar/config';
import { CORRIDOR, avatarIdFor, callerOrigin, settle } from '@/lib/payments/settle';
import { fail, ok, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send money out of the account, now.
 *
 * The whole corridor in one request, and the order of the steps is the
 * important part:
 *
 *   1. quote        what the naira is worth, from the live rate
 *   2. check        the balance covers it
 *   3. debit        the naira leaves before anything is sent
 *   4. settle       provision, deliver, price the last mile
 *
 * Steps 1 to 3 are the reservation and live here. Step 4 is everything after
 * the money has gone and lives in `lib/payments/settle`, because a scheduled
 * payment needs exactly that half and days later. Both callers behave
 * identically on failure: `settle` reverses before it returns, so an error
 * from it always means the account is already whole.
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

interface SendBody {
  recipientName?: string;
  country?: string;
  countryName?: string;
  payoutCurrency?: string;
  account?: string;
  amount?: number;
  note?: string;
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

    /*
     * The float, checked before the money moves rather than after.
     *
     * `settle` checks it too, and that is not a redundant check, it is a
     * different one. This one runs before the debit and can refuse cleanly,
     * leaving nothing on the ledger. The one inside `settle` runs after the
     * debit, because a scheduled payment reserved on Monday has no way to
     * pre-flight Friday's float, and has to reverse instead.
     *
     * An immediate send should not write a debit and a reversal to say "the
     * treasury is short". It should say so and write nothing.
     */
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
      party: name,
      partyKind: 'person',
      avatarId: avatarIdFor(name),
    });

    if (!debited) throw new Error('That reference has already been used.');

    // ── 4. Settle ─────────────────────────────────────────────────────────
    const result = await settle({
      reference,
      name,
      country,
      countryName: countryName ?? country,
      account: body.account,
      payoutCurrency: body.payoutCurrency ?? null,
      amount,
      note: body.note,
      origin: callerOrigin(request),
    });

    if (!result.ok) throw new Error(result.message);

    return ok({
      reference,
      recipient: result.recipient,
      sent: result.sent,
      delivered: result.delivered,
      payout: result.payout,
      quote: result.quote,
      balanceAfter: balance.balance - amount,
    });
  } catch (err) {
    return fail(err);
  }
}
