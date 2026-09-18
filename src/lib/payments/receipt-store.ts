/**
 * Where payment receipts live.
 *
 * Same shape as the three stores already in this project: an interface, a
 * memory default, and Redis when one is configured. The memory default is not
 * a placeholder, it is what keeps the app runnable with no managed service at
 * all.
 *
 * Losing one of these is the mildest failure of the four. A forgotten funding
 * reference can be re-seeded; a forgotten ledger entry is money with no record;
 * a forgotten scheduled payment is money reserved with nobody coming for it. A
 * forgotten receipt costs the detail panel its route and its hash, and the
 * ledger still says the payment happened. Worth saying out loud, because it is
 * the reason this store does not guard as hard as the ones above it.
 */

import { hasRedis, redisReceipts } from '@/lib/store/redis';
import type { PaymentReceipt, ReceiptStore } from './receipt';

/**
 * Hung off `globalThis`, like the ledger and the schedule, so an edit in dev
 * does not empty it between two page loads.
 */
const globalRef = globalThis as typeof globalThis & {
  __koraReceipts?: Map<string, PaymentReceipt>;
};

const memory: Map<string, PaymentReceipt> = (globalRef.__koraReceipts ??= new Map());

export const memoryReceipts: ReceiptStore = {
  async put(receipt) {
    if (memory.has(receipt.reference)) return false;
    memory.set(receipt.reference, receipt);
    return true;
  },

  async get(reference) {
    return memory.get(reference) ?? null;
  },

  async list() {
    return [...memory.values()];
  },
};

/** Redis when one is configured, process memory otherwise. */
export const receipts: ReceiptStore = hasRedis() ? redisReceipts : memoryReceipts;

/**
 * Write a receipt without letting the attempt break the payment.
 *
 * The money has already moved by the time anything calls this. A store that is
 * unreachable should cost the detail panel its route, not turn a delivered
 * payment into an error the sender sees, so every failure here is swallowed
 * deliberately and the caller is told nothing it would act on.
 */
export async function recordReceipt(receipt: PaymentReceipt): Promise<void> {
  try {
    await receipts.put(receipt);
  } catch {
    // The ledger entry is the record that matters and it is already written.
  }
}

/**
 * Receipts for a set of references, as a map.
 *
 * Reads the whole store and filters rather than fetching one key per
 * reference. The activity feed asks for thirty at a time, and thirty round
 * trips to Upstash to decorate a list is a worse trade than one read of a
 * store that holds a demo's worth of payments.
 */
export async function receiptsByReference(
  references: string[],
): Promise<Record<string, PaymentReceipt>> {
  if (references.length === 0) return {};

  try {
    const wanted = new Set(references);
    const found = await receipts.list();

    return Object.fromEntries(
      found.filter((r) => wanted.has(r.reference)).map((r) => [r.reference, r]),
    );
  } catch {
    // The rows still render. They render the way they did before this existed.
    return {};
  }
}
