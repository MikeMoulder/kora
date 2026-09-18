/**
 * The Payment Intent.
 *
 * The contract between "what the person said" and "what the system may do".
 *
 * The split this file exists to enforce:
 *   - A model decides what the sentence *means*. It fills this object.
 *   - Deterministic code decides what can *happen*. It validates this object
 *     against the corridor registry, the limits and the balance, and it is the
 *     only thing that may produce a quote or move money.
 *
 * So the model's output is a proposal, never an instruction. It cannot name a
 * corridor that does not exist, because `resolve.ts` maps its fields onto the
 * registry and discards anything unrecognised. It cannot execute, because
 * nothing here is wired to a signer. And a payment still requires an explicit
 * human confirmation of a reviewed quote.
 */

export interface PaymentIntent {
  /** As written by the sender — never used to address funds, only to label. */
  recipientName: string | null;
  /** ISO 3166-1 alpha-2, or null if not stated. */
  destinationCountry: string | null;
  /** Amount in `currency`, major units. */
  amount: number | null;
  /** ISO 4217 of the amount the sender stated. */
  currency: string | null;
  /** Free text, e.g. "logo design". Shown on the receipt. */
  purpose: string | null;
  timing: 'now' | 'scheduled';
  /** ISO-8601, only when `timing === 'scheduled'`. */
  scheduledFor: string | null;
  /** ISO 3166-1 alpha-2 the sender is funding from, when stated. */
  sourceCountry: string | null;
}

export type IntentSource = 'gemini' | 'rules';

export interface IntentResult {
  intent: PaymentIntent;
  /** Which parser produced this. Surfaced in the UI — no silent downgrades. */
  source: IntentSource;
  /** Fields the sender still has to supply before a quote is possible. */
  missing: (keyof PaymentIntent)[];
  /** Model's own note, or the rule parser's explanation. Never authoritative. */
  note: string | null;
}

export const EMPTY_INTENT: PaymentIntent = {
  recipientName: null,
  destinationCountry: null,
  amount: null,
  currency: null,
  purpose: null,
  timing: 'now',
  scheduledFor: null,
  sourceCountry: null,
};

/** A quote needs, at minimum, an amount, the currency it is in, and a destination. */
export function missingFields(intent: PaymentIntent): (keyof PaymentIntent)[] {
  const missing: (keyof PaymentIntent)[] = [];
  if (intent.amount === null || intent.amount <= 0) missing.push('amount');
  if (!intent.currency) missing.push('currency');
  if (!intent.destinationCountry) missing.push('destinationCountry');
  return missing;
}
