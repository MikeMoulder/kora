/**
 * Nigeria — NIP instant bank transfer.
 *
 * NIP (NIBSS Instant Payment) is the rail behind essentially every "send
 * money" button in Nigeria: bank apps, USSD, and the transfer tab of every
 * fintech. It settles in seconds and every Nigerian with a bank account
 * already knows how to drive it. That is why it is the first corridor — the
 * user has to learn nothing.
 *
 * Readiness: `sandbox`. The full state machine runs, the reference is real and
 * enforced, but settlement is simulated: going live requires a licensed
 * collections partner (a Paystack/Flutterwave/Kuda virtual-account API) and
 * that is a commercial relationship, not a coding task. Pollar's own fiat leg
 * is in the same state on testnet, so this is the honest ceiling for a
 * hackathon on either side of the corridor.
 *
 * What is real here: the corridor declaration, the quote maths, the FX rate,
 * the reference lifecycle, the operator-confirmation path, and the Pollar
 * hand-off that follows it.
 */

import type { KoraCorridor, KoraFundingRequest, KoraFundingState, KoraRailAdapter, KoraQuote } from '../types';
import { store } from '../store';
import { buildQuote, commonFields, field, instructions, makeReference } from './shared';
import {
  createBankTransferCharge,
  isFlutterwaveConfigured,
  isTestMode,
  usableExpiry,
  verifyByReference,
} from '@/lib/flutterwave/client';

const ADAPTER_ID = 'ng-nip';

/**
 * The fallback collections account.
 *
 * Reached only when Flutterwave is not configured. It is a fixed number, so
 * the reference has to do the matching and a human has to read it off a
 * statement. With Flutterwave configured the corridor gets a fresh virtual
 * account per payment and this is never used.
 */
const COLLECTION_ACCOUNT = {
  bankName: 'Sterling Bank (KORA sandbox collections)',
  accountNumber: '0123456789',
  accountName: 'KORA Payments Ltd / Collections',
};

/** Seconds after a user reports payment before the sandbox settles it. */
const SANDBOX_SETTLE_SECONDS = 6;

const corridors: KoraCorridor[] = [
  {
    id: 'NG.NGN.NIP.onramp',
    direction: 'onramp',
    country: 'NG',
    countryName: 'Nigeria',
    flag: '🇳🇬',
    fiat: 'NGN',
    rail: 'NIP',
    railLabel: 'Bank transfer (NIP)',
    asset: 'USDC',
    chain: 'stellar',
    readiness: 'sandbox',
    adapterId: ADAPTER_ID,
    limits: { min: 1_000, max: 5_000_000 },
    estimatedTime: '1–5 minutes',
    readinessNote: isFlutterwaveConfigured()
      ? 'Collections run on Flutterwave, which issues a real virtual account per payment and confirms receipt by webhook. Going live is KYC approval on the Flutterwave account, not more code.'
      : 'Settlement is simulated. Add a Flutterwave secret key and this corridor issues real virtual accounts instead of a fixed demo one.',
  },
];

export const nigeriaNipAdapter: KoraRailAdapter = {
  id: ADAPTER_ID,
  displayName: 'Nigeria · NIP bank transfer',
  settlementNote:
    'User pays from any Nigerian bank app into a collections account. Reference matching attributes the payment.',
  corridors,

  async getQuote(corridor, amount) {
    return buildQuote({
      corridor,
      amount,
      provider: 'KORA Local · Nigeria',
      // NIP transfers are cheap and flat-rated by Nigerian banks.
      railFeeFiat: 55,
      spreadBps: 75,
      estimatedTime: corridor.estimatedTime,
      recommended: true,
    });
  },

  async createFundingRequest(corridor: KoraCorridor, quote: KoraQuote): Promise<KoraFundingRequest> {
    const reference = makeReference();
    const now = new Date().toISOString();

    // Ask the partner for an account first, because everything below is
    // shaped by whether that worked. A failed charge falls back rather than
    // failing the payment: a fixed account somebody reconciles by hand is
    // worse than a virtual one and much better than a dead end.
    let account = {
      bankName: COLLECTION_ACCOUNT.bankName,
      accountNumber: COLLECTION_ACCOUNT.accountNumber,
      accountName: COLLECTION_ACCOUNT.accountName as string | null,
      payAmount: `${quote.amount.toLocaleString()} ${quote.currency}`,
      expiresAt: quote.expiresAt,
    };

    let settlement: KoraFundingRequest['settlement'] = {
      provider: 'simulated',
      mode: 'simulated',
    };

    let opening = `Collections account issued. Transfer ${quote.amount.toLocaleString()} ${quote.currency} quoting ${reference}.`;

    if (isFlutterwaveConfigured()) {
      const charge = await createBankTransferCharge({
        txRef: reference,
        amount: quote.amount,
        // Unique per charge and on a reserved test domain, so nothing here
        // stands in for a real mailbox.
        email: `${reference.toLowerCase()}@kora.test`,
        narration: `KORA corridor ${reference}`,
      });

      if (charge.ok) {
        // Only take the partner's expiry when it leaves a usable window. Its
        // test mode returns one seconds away, which would make the request
        // expire before anybody could read the account number.
        const partnerExpiry = usableExpiry(charge.data.expiresAt);

        account = {
          bankName: charge.data.bankName,
          accountNumber: charge.data.accountNumber,
          accountName: null,
          // Flutterwave adds its fee on top, so the figure a person types
          // into their bank app is its number and not ours. Printing the
          // quote here produces a transfer that never reconciles.
          payAmount: `${Number(charge.data.transferAmount).toLocaleString()} ${quote.currency}`,
          expiresAt: partnerExpiry ?? quote.expiresAt,
        };

        settlement = {
          provider: 'flutterwave',
          mode: isTestMode() ? 'test' : 'live',
          partnerReference: charge.data.transferReference,
        };

        opening = partnerExpiry
          ? `Flutterwave issued virtual account ${charge.data.accountNumber} at ${charge.data.bankName}, expiring ${partnerExpiry}.`
          : `Flutterwave issued virtual account ${charge.data.accountNumber} at ${charge.data.bankName}. Its stated expiry of "${charge.data.expiresAt}" was unusable, so the quote window stands.`;
      } else {
        opening = `Flutterwave could not issue an account (${charge.code}: ${charge.message}). Fell back to the fixed sandbox account, which a human has to reconcile.`;
      }
    }

    const request: KoraFundingRequest = {
      reference,
      corridorId: corridor.id,
      quoteId: quote.quoteId,
      status: 'awaiting_payment',
      amount: quote.amount,
      currency: quote.currency,
      receiveUsdc: quote.receiveUsdc,
      // A partner that confirms by webhook removes the human step. Without
      // one, somebody still has to read a bank statement.
      requiresOperatorConfirmation: settlement.provider !== 'flutterwave',
      createdAt: now,
      expiresAt: account.expiresAt,
      settlement,
      instructions: instructions([
        field('bank_name', 'Bank', account.bankName),
        field('bank_account', 'Account number', account.accountNumber, 'code'),
        ...(account.accountName
          ? [field('account_holder', 'Account name', account.accountName)]
          : []),
        field('amount', 'Exact amount', account.payAmount, 'amount'),
        ...commonFields(quote, corridor, reference, account.expiresAt).filter(
          (f) => f.key !== 'amount',
        ),
      ]),
    };

    const state: KoraFundingState = {
      reference,
      status: 'awaiting_payment',
      events: [{ at: now, status: 'awaiting_payment', detail: opening }],
    };

    await store.put({ request, state });
    return request;
  },

  async getFundingStatus(reference) {
    const record = await store.get(reference);
    if (!record) throw new Error(`Unknown funding reference ${reference}`);

    /*
     * Flutterwave settles on its own and tells us by webhook. A webhook needs
     * a public URL, which localhost does not have, so the corridor also asks
     * Flutterwave directly whenever the status is read. Both routes end at
     * the same verification call, so neither one credits a payment the issuer
     * has not confirmed.
     */
    if (
      record.request.settlement?.provider === 'flutterwave' &&
      record.state.status !== 'funded'
    ) {
      const verified = await verifyByReference(reference);

      if (verified.ok && verified.data.status === 'successful') {
        const funded = await store.append(
          reference,
          'funded',
          `Flutterwave confirmed ${verified.data.chargedAmount.toLocaleString()} ${verified.data.currency} against ${reference}, ref ${verified.data.flwRef}.`,
        );

        if (funded) {
          funded.state.fundedAmountUsdc = record.request.receiveUsdc;
          return funded.state;
        }
      }

      return record.state;
    }

    // No partner behind the rail: once the user reports payment, advance on a
    // timer. The states are the same either way; only who says the money
    // arrived changes.
    if (record.state.status === 'payment_reported') {
      const reportedAt = [...record.state.events]
        .reverse()
        .find((e) => e.status === 'payment_reported')?.at;
      if (reportedAt) {
        const elapsed = (Date.now() - new Date(reportedAt).getTime()) / 1000;
        if (elapsed >= SANDBOX_SETTLE_SECONDS) {
          const confirmed = await store.append(
            reference,
            'funded',
            `Simulated settlement: ${record.request.amount.toLocaleString()} ${record.request.currency} matched to ${reference}.`,
          );
          if (confirmed) {
            confirmed.state.fundedAmountUsdc = record.request.receiveUsdc;
            return confirmed.state;
          }
        }
      }
    }

    return record.state;
  },

  async confirmFunding(reference) {
    const record = await store.get(reference);
    if (!record) throw new Error(`Unknown funding reference ${reference}`);

    const updated = await store.append(
      reference,
      'funded',
      `Operator confirmed receipt of ${record.request.amount.toLocaleString()} ${record.request.currency} against ${reference}.`,
    );
    if (!updated) throw new Error(`Could not confirm ${reference}`);
    updated.state.fundedAmountUsdc = record.request.receiveUsdc;
    return updated.state;
  },
};
