import { reportPayment } from '@/lib/corridor/engine';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await params;
    return ok(await reportPayment(reference));
  } catch (err) {
    return fail(err, 404);
  }
}
