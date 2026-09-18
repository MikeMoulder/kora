/**
 * Where scheduled payments live.
 *
 * Same shape as the other two stores in this project: an interface, a memory
 * default, and Redis when one is configured. The memory default is not a
 * placeholder, it is what makes the app runnable with no managed service at
 * all, which matters because a demo that only works when Upstash is reachable
 * is a demo that will fail at the worst possible moment.
 *
 * It matters more here than for funding records, for the same reason it
 * matters for the ledger. A funding reference the server forgets can be
 * re-seeded by the client that made it. A scheduled payment the server forgets
 * is money that left the balance with nothing left to say where it went, and
 * nobody finds out until Friday.
 *
 * That is stated rather than fixed: without Redis this store empties on every
 * restart, and `npm run dev` restarts on every edit. `hasRedis()` is what the
 * interface reads to tell somebody so.
 */

import { hasRedis, redisSchedule } from '@/lib/store/redis';
import type { ScheduleStatus, ScheduleStore, ScheduledPayment } from './types';

/**
 * Hung off `globalThis`, like the ledger and for the same reason: without it
 * every edit in dev silently empties the store mid-demo, and a scheduled
 * payment vanishing between two page loads looks like a bug in the feature
 * rather than a property of the dev server.
 */
const globalRef = globalThis as typeof globalThis & {
  __koraSchedule?: Map<string, ScheduledPayment>;
};

const memory: Map<string, ScheduledPayment> = (globalRef.__koraSchedule ??= new Map());

export const memorySchedule: ScheduleStore = {
  async put(payment) {
    if (memory.has(payment.reference)) return false;
    memory.set(payment.reference, payment);
    return true;
  },

  async get(reference) {
    return memory.get(reference) ?? null;
  },

  async transition(reference, from, to, outcome) {
    const current = memory.get(reference);

    /*
     * The status has to be the one the caller expected.
     *
     * This is the whole of the double-send guard on the memory path. The
     * runner and the cancel route can both be called twice, by a retry, a
     * double click or two browser tabs polling at once, and the second call
     * has to do nothing rather than deliver a second time.
     */
    if (!current || current.status !== from) return null;

    const next: ScheduledPayment = { ...current, status: to, outcome };
    memory.set(reference, next);
    return next;
  },

  async list() {
    return [...memory.values()];
  },
};

/** Redis when one is configured, process memory otherwise. */
export const schedule: ScheduleStore = hasRedis() ? redisSchedule : memorySchedule;

/**
 * Whether what is in the store survives a restart.
 *
 * Read by the panel so it can say so. A scheduled payment that quietly
 * disappears when the dev server reloads is the kind of thing that gets
 * discovered during a demo, and the honest fix is to say which of the two
 * stores is running rather than to hope.
 */
export function scheduleIsDurable(): boolean {
  return hasRedis();
}

export type { ScheduleStatus, ScheduleStore, ScheduledPayment };
