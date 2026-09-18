/**
 * The corridor engine.
 *
 * Rail-agnostic orchestration. Every verb here goes through the adapter
 * interface, so adding a country is adding an adapter and nothing else — no
 * branch in this file, no branch in the UI.
 */

import { store } from './store';
import { assertExecutable, getAdapter, getCorridor } from './registry';
import type { KoraFundingRequest, KoraFundingState, KoraQuote } from './types';

export async function quote(corridorId: string, amount: number): Promise<KoraQuote> {
  const corridor = getCorridor(corridorId);
  assertExecutable(corridor);

  if (amount < corridor.limits.min || amount > corridor.limits.max) {
    throw new Error(
      `Amount out of range for ${corridor.countryName} ${corridor.railLabel}: ` +
        `${corridor.limits.min.toLocaleString()}–${corridor.limits.max.toLocaleString()} ${corridor.fiat}`,
    );
  }

  return getAdapter(corridor).getQuote(corridor, amount);
}

export async function createFunding(
  corridorId: string,
  q: KoraQuote,
): Promise<KoraFundingRequest> {
  const corridor = getCorridor(corridorId);
  assertExecutable(corridor);

  if (new Date(q.expiresAt).getTime() < Date.now()) {
    throw new Error('Quote has expired. Request a new one.');
  }

  return getAdapter(corridor).createFundingRequest(corridor, q);
}

export async function fundingStatus(reference: string): Promise<KoraFundingState> {
  const record = await store.get(reference);
  if (!record) throw new Error(`Unknown funding reference ${reference}`);

  const corridor = getCorridor(record.request.corridorId);

  if (record.state.status === 'awaiting_payment' && isExpired(record.request.expiresAt)) {
    const expired = await store.append(
      reference,
      'expired',
      'Quote window elapsed before payment was reported.',
    );
    if (expired) return expired.state;
  }

  return getAdapter(corridor).getFundingStatus(reference);
}

/**
 * The user says they have paid. This does not fund anything — it moves the
 * request into `payment_reported` and lets the rail confirm. Keeping these
 * separate is the whole point: a claim is not a settlement.
 */
export async function reportPayment(reference: string): Promise<KoraFundingState> {
  const record = await store.get(reference);
  if (!record) throw new Error(`Unknown funding reference ${reference}`);

  if (record.state.status !== 'awaiting_payment') {
    return record.state;
  }

  const updated = await store.append(
    reference,
    'payment_reported',
    'Sender reported the transfer. Awaiting rail confirmation.',
  );
  if (!updated) throw new Error(`Could not update ${reference}`);
  return updated.state;
}

/** Operator-side confirmation, for rails with no programmatic callback. */
export async function confirmFunding(reference: string): Promise<KoraFundingState> {
  const record = await store.get(reference);
  if (!record) throw new Error(`Unknown funding reference ${reference}`);

  const adapter = getAdapter(getCorridor(record.request.corridorId));
  if (!adapter.confirmFunding) {
    throw new Error(`${adapter.displayName} confirms its own funding; no operator step exists.`);
  }
  return adapter.confirmFunding(reference);
}

export async function getFundingRequest(reference: string): Promise<KoraFundingRequest | null> {
  return (await store.get(reference))?.request ?? null;
}

/** Re-seed a record the server has forgotten (cold serverless instance). */
export async function rehydrate(request: KoraFundingRequest): Promise<void> {
  if (await store.get(request.reference)) return;
  await store.put({
    request,
    state: {
      reference: request.reference,
      status: request.status,
      events: [
        {
          at: new Date().toISOString(),
          status: request.status,
          detail: 'Re-hydrated from the client after a cold start.',
        },
      ],
    },
  });
}

function isExpired(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}
