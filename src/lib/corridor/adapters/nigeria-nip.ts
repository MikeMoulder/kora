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

const ADAPTER_ID = 'ng-nip';

/**
 * The collections account a user pays into.
 *
 * In production this is a per-payment virtual account issued by the
 * collections partner, which is what makes reference-matching reliable. In
 * sandbox it is a fixed demo account and the reference does the matching.
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
    readinessNote:
      'Settlement is simulated. Going live needs a licensed Nigerian collections partner issuing virtual accounts — a commercial agreement, not more code.',
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

    const request: KoraFundingRequest = {
      reference,
      corridorId: corridor.id,
      quoteId: quote.quoteId,
      status: 'awaiting_payment',
      amount: quote.amount,
      currency: quote.currency,
      receiveUsdc: quote.receiveUsdc,
      requiresOperatorConfirmation: true,
      createdAt: now,
      expiresAt: quote.expiresAt,
      instructions: instructions([
        field('bank_name', 'Bank', COLLECTION_ACCOUNT.bankName),
        field('bank_account', 'Account number', COLLECTION_ACCOUNT.accountNumber, 'code'),
        field('account_holder', 'Account name', COLLECTION_ACCOUNT.accountName),
        ...commonFields(quote, corridor, reference, quote.expiresAt),
      ]),
    };

    const state: KoraFundingState = {
      reference,
      status: 'awaiting_payment',
      events: [
        {
          at: now,
          status: 'awaiting_payment',
          detail: `Collections account issued. Transfer ${quote.amount.toLocaleString()} ${quote.currency} quoting ${reference}.`,
        },
      ],
    };

    await store.put({ request, state });
    return request;
  },

  async getFundingStatus(reference) {
    const record = await store.get(reference);
    if (!record) throw new Error(`Unknown funding reference ${reference}`);

    // Sandbox settlement: once the user reports payment, advance on a timer.
    // A production adapter replaces this with the collections partner's
    // webhook; the states it moves through are the same either way.
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
