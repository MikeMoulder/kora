import { rehydrate } from '@/lib/corridor/engine';
import type { KoraFundingRequest } from '@/lib/corridor/types';
import { fail, ok, readJson } from '@/lib/api';

export const runtime = 'nodejs';

/** Re-seed a funding record onto a serverless instance that never saw it. */
export async function POST(request: Request) {
  try {
    const { request: funding } = await readJson<{ request?: KoraFundingRequest }>(request);
    if (!funding?.reference) throw new Error('A funding request is required.');

    await rehydrate(funding);
    return ok({ reference: funding.reference, rehydrated: true });
  } catch (err) {
    return fail(err);
  }
}
