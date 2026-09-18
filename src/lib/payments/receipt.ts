/**
 * What a payment left behind.
 *
 * A scheduled payment has had a record of itself since the day it could be
 * held: where it was going, what it was for, who asked, and what happened when
 * it ran. An immediate send had none. It wrote a debit to the ledger, settled,
 * handed the whole result to the browser that asked for it, and forgot.
 *
 * That is why the two look so different when you open them. The detail panel
 * was not treating them differently; there was simply nothing to read for one
 * of them. A payment that cannot show its route or its hash five minutes later
 * is a payment nobody can check, and the hash is the only line on that screen
 * that does not depend on trusting us.
 *
 * So this is the scheduled payment's record, for payments that were never
 * scheduled. It holds exactly what `settle` already worked out and nothing it
 * had to invent.
 *
 * Types only. The store is next door, so a client component can read the shape
 * without pulling a Redis client in behind it.
 */

/**
 * How a payment ended.
 *
 * Deliberately the same shape as `ScheduledPayment['outcome']`, because the
 * detail panel renders one screen and should not care which of the two it is
 * looking at. `hash` is null when the delivery never happened, and then
 * `message` says why in a sentence safe to show somebody.
 */
export interface PaymentOutcome {
  at: string;
  hash: string | null;
  explorer: string | null;
  delivered: { amount: number; asset: string } | null;
  message: string | null;
}

export interface PaymentReceipt {
  /** The reference the debit was written under. The join key, everywhere. */
  reference: string;
  /** When the send was asked for. */
  at: string;

  recipient: {
    name: string;
    /** ISO 3166-1 alpha-2. What the route draws its second flag from. */
    country: string;
    countryName: string;
    account: string | null;
  };

  /** Major units of `currency`. Already off the balance by the time this exists. */
  amount: number;
  currency: string;
  note: string | null;

  /**
   * Who asked for it.
   *
   * The same two values a scheduled payment carries. Picking somebody out of
   * the beneficiary book is not a third origin: the book fills the send form
   * in and a person still presses send, so it is the form that made the
   * request. The agent is different because it read a sentence.
   */
  origin: 'agent' | 'form';

  /** Never null. A receipt is written once settlement has an answer either way. */
  outcome: PaymentOutcome;
}

/**
 * The store.
 *
 * Write-once, like the ledger and unlike the schedule. A scheduled payment
 * changes state as it moves from held to sent; an immediate payment is already
 * finished by the time anything here hears about it, so there is nothing to
 * transition and a second write for one reference is a bug rather than an
 * update.
 */
export interface ReceiptStore {
  /** Returns false when the reference already has a receipt. */
  put(receipt: PaymentReceipt): Promise<boolean>;
  get(reference: string): Promise<PaymentReceipt | null>;
  list(): Promise<PaymentReceipt[]>;
}
