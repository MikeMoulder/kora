/**
 * Kenya — M-Pesa.
 *
 * Kept as its own adapter rather than folded into a generic "mobile money"
 * one. M-Pesa is not a GSMA-pattern wallet with a different logo: it has its
 * own API (Daraja), its own push-to-phone authorisation model (STK push, where
 * the user approves on the handset rather than being redirected), its own
 * paybill/till distinction, and its own regulator. An adapter that pretended
 * M-Pesa and MTN MoMo were the same integration would be wrong in the places
 * that matter.
 *
 * Readiness: `sandbox`. Safaricom's Daraja sandbox is genuinely open, so this
 * is the corridor most likely to become `live` first — but it needs a shortcode
 * and a reviewed callback URL, which is a days-long approval, not an
 * afternoon.
 */

import type { KoraCorridor, KoraFundingRequest, KoraFundingState, KoraQuote, KoraRailAdapter } from '../types';
import { store } from '../store';
import {
  buildQuote,
  commonFields,
  field,
  instructions,
  makeReference,
  makeScannable,
} from './shared';

const ADAPTER_ID = 'ke-mpesa';

const PAYBILL = '400200';

/** STK push is fast; the user is approving on their handset in real time. */
const SANDBOX_SETTLE_SECONDS = 4;

const corridors: KoraCorridor[] = [
  {
    id: 'KE.KES.MPESA.onramp',
    direction: 'onramp',
    country: 'KE',
    countryName: 'Kenya',
    flag: '🇰🇪',
    fiat: 'KES',
    rail: 'MPESA',
    railLabel: 'M-Pesa (STK push)',
    asset: 'USDC',
    chain: 'stellar',
    readiness: 'sandbox',
    adapterId: ADAPTER_ID,
    limits: { min: 100, max: 250_000 },
    estimatedTime: 'Under 1 minute',
    readinessNote:
      'Runs against the documented Daraja STK-push flow with simulated settlement. Live needs an approved Safaricom shortcode and a reviewed callback URL.',
  },
];

export const kenyaMpesaAdapter: KoraRailAdapter = {
  id: ADAPTER_ID,
  displayName: 'Kenya · M-Pesa',
  settlementNote:
    'STK push to the user’s handset. They approve with their M-Pesa PIN; the callback confirms.',
  corridors,

  async getQuote(corridor, amount) {
    return buildQuote({
      corridor,
      amount,
      provider: 'KORA Local · Kenya',
      // Safaricom paybill charges scale with amount; approximated as a band.
      railFeeFiat: amount <= 1_000 ? 7 : amount <= 20_000 ? 35 : 90,
      spreadBps: 75,
      estimatedTime: corridor.estimatedTime,
      requiredFields: [
        {
          key: 'msisdn',
          label: 'M-Pesa phone number',
          type: 'tel',
        },
      ],
    });
  },

  async createFundingRequest(corridor: KoraCorridor, quote: KoraQuote): Promise<KoraFundingRequest> {
    const reference = makeReference('KORA');
    const now = new Date().toISOString();

    // The USSD string a user can dial if the push notification does not
    // arrive — the standard Safaricom fallback. Also the scannable payload.
    const ussd = `*334*1*${PAYBILL}*${Math.round(quote.amount)}*${reference}#`;
    const scannable = await makeScannable('opaque', ussd, 'Or dial this USSD string');

    const request: KoraFundingRequest = {
      reference,
      corridorId: corridor.id,
      quoteId: quote.quoteId,
      status: 'awaiting_payment',
      amount: quote.amount,
      currency: quote.currency,
      receiveUsdc: quote.receiveUsdc,
      requiresOperatorConfirmation: false,
      createdAt: now,
      expiresAt: quote.expiresAt,
      instructions: instructions(
        [
          field('bank_name', 'Paybill', PAYBILL, 'code'),
          field('account_holder', 'Account name', 'KORA Collections'),
          field('memo', 'Account number', reference, 'code'),
          ...commonFields(quote, corridor, reference, quote.expiresAt),
        ],
        scannable,
      ),
    };

    const state: KoraFundingState = {
      reference,
      status: 'awaiting_payment',
      events: [
        {
          at: now,
          status: 'awaiting_payment',
          detail: `STK push sent. Approve ${quote.amount.toLocaleString()} ${quote.currency} on your handset.`,
        },
      ],
    };

    await store.put({ request, state });
    return request;
  },

  async getFundingStatus(reference) {
    const record = await store.get(reference);
    if (!record) throw new Error(`Unknown funding reference ${reference}`);

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
            `Simulated Daraja callback: ${record.request.amount.toLocaleString()} ${record.request.currency} received for ${reference}.`,
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
};
