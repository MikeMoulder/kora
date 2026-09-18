/**
 * A payment that has been agreed but not yet made.
 *
 * The parser has produced `timing` and `scheduledFor` since the first version
 * of the intent model and nothing has ever consumed them. This is what
 * consumes them.
 *
 * The central decision, and everything else follows from it: **the naira
 * leaves the balance when the payment is scheduled, not when it is sent.**
 *
 * The alternative is to debit at due time, which is simpler and wrong. A
 * balance that still shows money already promised to somebody is a balance
 * you can spend twice, and the second spend does not fail at the point of
 * spending, it fails on Friday when the scheduled payment cannot cover
 * itself. Reserving up front means the number on the card is the money you can
 * actually use, and a scheduled payment can only fail for reasons outside the
 * account.
 *
 * So a scheduled payment is not a note about the future. It is a debit that
 * has already happened with a delivery still owed, which is why cancelling one
 * writes a credit rather than deleting a row.
 */

export type ScheduleStatus = 'held' | 'sent' | 'cancelled' | 'failed';

export interface ScheduledPayment {
  /**
   * The reference the naira was debited under, and the idempotency key.
   *
   * Carried into `settle` unchanged, so the debit, the delivery and any
   * reversal all share one reference and the ledger reads as one event rather
   * than three unrelated ones.
   */
  reference: string;
  createdAt: string;
  /** When it should go. ISO 8601. */
  dueAt: string;

  recipient: {
    name: string;
    /** ISO 3166-1 alpha-2. */
    country: string;
    countryName: string;
    account: string | null;
    avatarId: string | null;
  };

  /** Major units of `currency`. Already off the balance. */
  amount: number;
  currency: string;
  note: string | null;

  /** Who asked for it. The agent is a separate origin from the send form. */
  origin: 'agent' | 'form';

  status: ScheduleStatus;

  /**
   * What happened when it ran. Null while held.
   *
   * `sent` carries the Stellar hash, which is the only artefact that proves
   * the whole thing worked. `failed` carries why, in a sentence safe to show.
   */
  outcome: {
    at: string;
    hash: string | null;
    explorer: string | null;
    delivered: { amount: number; asset: string } | null;
    message: string | null;
  } | null;
}

/**
 * The store.
 *
 * Deliberately not append-only, unlike the ledger. A scheduled payment is a
 * single thing that changes state four ways at most, and modelling that as an
 * event log would mean every reader replaying a sequence to find out whether
 * Friday's payment is still coming. The ledger underneath it is append-only
 * and that is where the audit trail lives: every status change here has a
 * corresponding entry there that cannot be edited.
 */
export interface ScheduleStore {
  /** Returns false when the reference is already present. */
  put(payment: ScheduledPayment): Promise<boolean>;
  get(reference: string): Promise<ScheduledPayment | null>;
  /**
   * Compare and set: move a payment from one status to another.
   *
   * `from` is what makes this safe rather than a convenience. Every caller
   * knows which state it believes the payment is in, and a call that names the
   * wrong one does nothing and returns null instead of overwriting whatever it
   * found.
   *
   * That single property covers three different hazards with one mechanism:
   *
   *   from 'held' to 'cancelled'  a second click cancels nothing
   *   from 'held' to 'failed'     the runner claims a payment exactly once
   *   from 'failed' to 'sent'     only the runner that claimed it may record
   *
   * An earlier version guarded on `held` alone, which meant the runner could
   * claim a payment but then could not write the outcome, because by then it
   * was not held any more. Naming both ends removes the need for a bypass, and
   * a store interface with a documented way around its own guard is a store
   * interface whose guard means nothing.
   */
  transition(
    reference: string,
    from: ScheduleStatus,
    to: ScheduleStatus,
    outcome: ScheduledPayment['outcome'],
  ): Promise<ScheduledPayment | null>;
  list(): Promise<ScheduledPayment[]>;
}

/** Soonest first, then newest first among equals. */
export function byDueDate(a: ScheduledPayment, b: ScheduledPayment): number {
  return a.dueAt.localeCompare(b.dueAt) || b.createdAt.localeCompare(a.createdAt);
}

/** Everything still waiting, soonest first. */
export function heldPayments(all: ScheduledPayment[]): ScheduledPayment[] {
  return all.filter((p) => p.status === 'held').sort(byDueDate);
}

/**
 * Everything held whose time has come.
 *
 * `<=` rather than `<`. A payment due at exactly now is due, and the runner
 * that only ever fires strictly after would leave one sitting for however long
 * its polling interval happens to be.
 */
export function duePayments(all: ScheduledPayment[], now = Date.now()): ScheduledPayment[] {
  return heldPayments(all).filter((p) => {
    const due = Date.parse(p.dueAt);
    return Number.isFinite(due) && due <= now;
  });
}
