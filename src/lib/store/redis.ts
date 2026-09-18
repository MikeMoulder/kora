/**
 * Redis, when there is one.
 *
 * Both stores in this project were written behind an interface with a memory
 * default, so this is an adapter rather than a rewrite. Nothing that uses them
 * changes, and the app keeps working with no Redis at all, which matters
 * because a demo that only runs when a managed service is reachable is a demo
 * that will fail at the worst moment.
 *
 * Upstash over HTTP rather than a TCP client. Serverless functions have no
 * stable process to pool connections from, and a Postgres-shaped connection
 * pool behind a lambda is the classic way to exhaust a database with traffic
 * that is not even heavy.
 *
 * Environment: Vercel's Upstash integration injects `KV_REST_API_URL` and
 * `KV_REST_API_TOKEN`. A direct Upstash account uses `UPSTASH_REDIS_REST_URL`
 * and `UPSTASH_REDIS_REST_TOKEN`. Both are accepted, so it does not matter
 * which route was taken to provision it.
 */

import { Redis } from '@upstash/redis';
import type { FundingRecord, FundingStore } from '../corridor/store';
import type { LedgerEntry, LedgerStore } from '../account/ledger';
import type { ScheduleStore, ScheduledPayment } from '../schedule/types';

const URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '';
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

export function hasRedis(): boolean {
  return URL.length > 0 && TOKEN.length > 0;
}

/**
 * One client for the process. Upstash's client is a thin HTTP wrapper, so this
 * is about not re-parsing configuration rather than about connection reuse.
 */
const globalRef = globalThis as typeof globalThis & { __koraRedis?: Redis };

function client(): Redis {
  return (globalRef.__koraRedis ??= new Redis({ url: URL, token: TOKEN }));
}

// Namespaced so a shared database is not a shared namespace.
const FUNDING_KEY = (reference: string) => `kora:funding:${reference}`;
const FUNDING_INDEX = 'kora:funding:index';
const LEDGER_KEY = (reference: string) => `kora:ledger:entry:${reference}`;
const LEDGER_LIST = 'kora:ledger:entries';
const SCHEDULE_KEY = (reference: string) => `kora:schedule:${reference}`;
const SCHEDULE_INDEX = 'kora:schedule:index';

export const redisFundingStore: FundingStore = {
  async put(record) {
    const redis = client();
    await Promise.all([
      redis.set(FUNDING_KEY(record.request.reference), record),
      redis.sadd(FUNDING_INDEX, record.request.reference),
    ]);
  },

  async get(reference) {
    return (await client().get<FundingRecord>(FUNDING_KEY(reference))) ?? null;
  },

  async append(reference, status, detail) {
    const redis = client();
    const record = await redis.get<FundingRecord>(FUNDING_KEY(reference));
    if (!record) return null;

    const next: FundingRecord = {
      request: { ...record.request, status },
      state: {
        ...record.state,
        status,
        events: [
          ...record.state.events,
          { at: new Date().toISOString(), status, detail },
        ],
      },
    };

    await redis.set(FUNDING_KEY(reference), next);
    return next;
  },

  async list() {
    const redis = client();
    const references = await redis.smembers(FUNDING_INDEX);
    if (references.length === 0) return [];

    const records = await Promise.all(
      references.map((reference) => redis.get<FundingRecord>(FUNDING_KEY(reference))),
    );

    return records.filter((record): record is FundingRecord => record !== null);
  },
};

export const redisLedger: LedgerStore = {
  async append(entry) {
    const redis = client();

    /*
     * `nx` is what makes this idempotent, and it has to be the thing that
     * decides rather than a read followed by a write. Two webhook deliveries
     * arriving together would both find nothing on the read and both credit.
     * Redis settles it in one round trip: the first SET wins, the second
     * returns null and never touches the list.
     */
    const claimed = await redis.set(LEDGER_KEY(entry.reference), entry, { nx: true });
    if (claimed === null) return false;

    await redis.rpush(LEDGER_LIST, entry);
    return true;
  },

  async list() {
    const entries = await client().lrange<LedgerEntry>(LEDGER_LIST, 0, -1);
    return entries.sort((a, b) => a.at.localeCompare(b.at));
  },
};

/**
 * Scheduled payments.
 *
 * A set of references plus one key each, rather than a list of records. The
 * runner reads every held payment on each tick and the panel reads the same
 * set, so the access pattern is "all of them" either way, and a set gives the
 * one operation a list cannot: settling a single payment without rewriting the
 * others.
 */
export const redisSchedule: ScheduleStore = {
  async put(payment) {
    const redis = client();

    /*
     * `nx` decides, not a read followed by a write.
     *
     * Same reasoning as the ledger. Two requests arriving together would both
     * find nothing on the read and both write, and for a scheduled payment
     * that is a duplicate reservation: the naira comes off the balance twice
     * for one instruction.
     */
    const claimed = await redis.set(SCHEDULE_KEY(payment.reference), payment, { nx: true });
    if (claimed === null) return false;

    await redis.sadd(SCHEDULE_INDEX, payment.reference);
    return true;
  },

  async get(reference) {
    return (await client().get<ScheduledPayment>(SCHEDULE_KEY(reference))) ?? null;
  },

  async transition(reference, from, to, outcome) {
    const redis = client();
    const current = await redis.get<ScheduledPayment>(SCHEDULE_KEY(reference));

    /*
     * The honest note about this one.
     *
     * Read, check, write is not atomic, so two runners firing on the same tick
     * could in principle both read `held` and both go on to deliver. It is not
     * closed here because closing it properly needs a Lua script or a lock,
     * and the thing it would be protecting against does not exist in this
     * deployment: the runner is triggered by the dashboard in one browser and
     * settlement itself takes seconds, not milliseconds.
     *
     * It is written down rather than left for somebody to discover, because
     * the day this runs on a cron with two instances it becomes real, and the
     * failure it produces is a payment delivered twice. The fix is a Lua
     * script doing the compare and the set in one round trip; the signature
     * here is already the right shape for it.
     */
    if (!current || current.status !== from) return null;

    const next: ScheduledPayment = { ...current, status: to, outcome };
    await redis.set(SCHEDULE_KEY(reference), next);
    return next;
  },

  async list() {
    const redis = client();
    const references = await redis.smembers(SCHEDULE_INDEX);
    if (references.length === 0) return [];

    const records = await Promise.all(
      references.map((reference) => redis.get<ScheduledPayment>(SCHEDULE_KEY(reference))),
    );

    return records.filter((record): record is ScheduledPayment => record !== null);
  },
};
