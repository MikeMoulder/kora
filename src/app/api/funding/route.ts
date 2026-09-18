import { createFunding } from '@/lib/corridor/engine';
import type { KoraQuote } from '@/lib/corridor/types';
import { fail, ok, readJson } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { corridorId, quote } = await readJson<{ corridorId?: string; quote?: KoraQuote }>(request);
    if (!corridorId || !quote) throw new Error('corridorId and quote are required.');

    return ok(await createFunding(corridorId, quote));
  } catch (err) {
    return fail(err);
  }
}
