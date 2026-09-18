/**
 * The account ledger.
 *
 * The dashboard balance used to be a constant. It is now an opening figure
 * plus an append-only list of movements, which is the only shape that lets a
 * deposit actually change anything. The opening figure is still sample data
 * and the interface says so; what sits on top of it is real.
 *
 * Append-only on purpose. A balance you can set is a balance you can set
 * wrongly, and a payments demo that overwrites a number rather than recording
 * a movement has no answer to "where did that come from".
 *
 * Every entry carries the partner's reference, which doubles as the
 * idempotency key. Flutterwave retries a webhook three times over ninety
 * minutes when it does not get a 200, and a retry must not credit twice.
 */

export type LedgerDirection = 'credit' | 'debit';

export interface LedgerEntry {
  /** The partner's reference for this movement, and the idempotency key. */
  reference: string;
  at: string;
  direction: LedgerDirection;
  /** Major units. Always positive; `direction` carries the sign. */
  amount: number;
  currency: string;
  detail: string;
  /** Who told us this happened. */
  source: 'flutterwave' | 'corridor' | 'simulated';
}

export interface LedgerStore {
  /**
   * Record a movement.
   *
   * Returns false when an entry with the same reference is already present,
   * which is a duplicate delivery rather than an error.
   */
  append(entry: LedgerEntry): Promise<boolean>;
  list(): Promise<LedgerEntry[]>;
}

/**
 * Hung off `globalThis` for the same reason the funding store is: without it
 * every edit in dev silently empties the ledger mid-demo.
 */
const globalRef = globalThis as typeof globalThis & {
  __koraLedger?: Map<string, LedgerEntry>;
};

const memory: Map<string, LedgerEntry> = (globalRef.__koraLedger ??= new Map());

export const memoryLedger: LedgerStore = {
  async append(entry) {
    if (memory.has(entry.reference)) return false;
    memory.set(entry.reference, entry);
    return true;
  },

  async list() {
    return [...memory.values()].sort((a, b) => a.at.localeCompare(b.at));
  },
};

export const ledger: LedgerStore = memoryLedger;

/** Signed value of a movement, for summing. */
export function signedAmount(entry: LedgerEntry): number {
  return entry.direction === 'credit' ? entry.amount : -entry.amount;
}

export interface AccountBalance {
  /** Sample data, and labelled as such wherever it is shown. */
  opening: number;
  /** The sum of everything real that has happened since. */
  movements: number;
  balance: number;
  currency: string;
  entries: LedgerEntry[];
}

/**
 * Opening figure plus movements.
 *
 * Computed on read rather than stored. A stored balance and a stored list of
 * movements are two sources of truth that will eventually disagree, and the
 * one that disagrees silently is always the stored total.
 */
export async function accountBalance(
  opening: number,
  currency = 'NGN',
): Promise<AccountBalance> {
  const entries = await ledger.list();
  const movements = entries
    .filter((e) => e.currency === currency)
    .reduce((total, e) => total + signedAmount(e), 0);

  return {
    opening,
    movements,
    balance: opening + movements,
    currency,
    entries,
  };
}
