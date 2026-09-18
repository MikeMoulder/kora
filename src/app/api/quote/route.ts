import { quote } from '@/lib/corridor/engine';
import { usdcToBob } from '@/lib/corridor/rates';
import { fail, ok, readJson } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { corridorId, amount } = await readJson<{ corridorId?: string; amount?: number }>(request);
    if (!corridorId) throw new Error('corridorId is required.');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new Error('amount must be a positive number.');
    }

    const q = await quote(corridorId, amount);
    // The Bolivian leg is Pollar's to settle; we only display the estimate.
    const { bob, rate } = await usdcToBob(q.receiveUsdc);

    return ok({
      quote: q,
      destinationEstimate: { currency: 'BOB', amount: bob, rate: rate.perUsd, source: rate.source },
    });
  } catch (err) {
    return fail(err);
  }
}
