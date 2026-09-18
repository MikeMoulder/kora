import { fundingStatus, getFundingRequest } from '@/lib/corridor/engine';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await params;
    const [state, request] = await Promise.all([
      fundingStatus(reference),
      getFundingRequest(reference),
    ]);
    return ok({ state, request });
  } catch (err) {
    // A forgotten reference is a cold-start, not a bug — let the client re-seed.
    return fail(err, 404);
  }
}
