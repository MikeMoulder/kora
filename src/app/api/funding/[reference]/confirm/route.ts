import { confirmFunding } from '@/lib/corridor/engine';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';

/**
 * The operator side of a semi-manual rail. In production this is behind
 * operator auth and driven by a back office; here it is the button the demo
 * uses to stand in for the human who checks the bank statement.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await params;
    return ok(await confirmFunding(reference));
  } catch (err) {
    return fail(err, 404);
  }
}
