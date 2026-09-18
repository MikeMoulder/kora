/**
 * Funding-request store.
 *
 * A swappable interface with a process-memory default, and Redis in front of
 * it when one is configured.
 *
 * Without Redis the limitation is worth stating rather than hiding: on Vercel
 * each serverless instance has its own memory, so a request landing on a cold
 * instance will not find a reference created by a warm one. The client keeps
 * its own copy of every funding request it created and re-hydrates the server
 * on a miss (`POST /api/funding/rehydrate`), so the demo survives it either
 * way. With Redis configured the problem does not arise, and the rehydrate
 * path stays as the belt to that braces.
 */

import { hasRedis, redisFundingStore } from '@/lib/store/redis';
import type { KoraFundingRequest, KoraFundingState, FundingStatus } from './types';

export interface FundingRecord {
  request: KoraFundingRequest;
  state: KoraFundingState;
}

export interface FundingStore {
  put(record: FundingRecord): Promise<void>;
  get(reference: string): Promise<FundingRecord | null>;
  append(reference: string, status: FundingStatus, detail: string): Promise<FundingRecord | null>;
  list(): Promise<FundingRecord[]>;
}

/**
 * Hang the map off `globalThis` so it survives Next's dev-mode module reloads.
 * Without this, every edit silently empties the store mid-demo.
 */
const globalRef = globalThis as typeof globalThis & {
  __koraFundingStore?: Map<string, FundingRecord>;
};

const memory: Map<string, FundingRecord> = (globalRef.__koraFundingStore ??= new Map());

export const memoryStore: FundingStore = {
  async put(record) {
    memory.set(record.request.reference, record);
  },

  async get(reference) {
    return memory.get(reference) ?? null;
  },

  async append(reference, status, detail) {
    const record = memory.get(reference);
    if (!record) return null;
    const next: FundingRecord = {
      request: { ...record.request, status },
      state: {
        ...record.state,
        status,
        events: [...record.state.events, { at: new Date().toISOString(), status, detail }],
      },
    };
    memory.set(reference, next);
    return next;
  },

  async list() {
    return [...memory.values()];
  },
};

/**
 * Redis when one is configured, process memory otherwise.
 *
 * Chosen once at module load rather than per call. A store that changed
 * backend halfway through a payment would be worse than either backend.
 */
export const store: FundingStore = hasRedis() ? redisFundingStore : memoryStore;
