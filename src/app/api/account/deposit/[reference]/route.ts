import { ledger } from '@/lib/account/ledger';
import { verifyByReference } from '@/lib/flutterwave/client';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Confirm a deposit and credit it.
 *
 * Asks Flutterwave what it believes about the reference and credits the ledger
 * on that answer alone. The webhook does the same thing when it can reach us;
 * this path exists because localhost has no public URL, and because a demo
 * should not depend on a delivery that may be retried in thirty minutes.
 *
 * Crediting is idempotent through the ledger, keyed on the reference, so this
 * endpoint can be polled as often as the interface likes and the webhook can
 * arrive afterwards without producing a second credit.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await params;

    const verified = await verifyByReference(reference);

    if (!verified.ok) {
      return ok({ reference, status: 'pending', credited: false, detail: verified.code });
    }

    if (verified.data.status !== 'successful') {
      return ok({
        reference,
        status: verified.data.status,
        credited: false,
        detail: `Flutterwave reports ${verified.data.status}.`,
      });
    }

    const credited = await ledger.append({
      reference,
      at: new Date().toISOString(),
      direction: 'credit',
      // Flutterwave's `amount` is what was charged for, not the fee-inclusive
      // total the payer sent. The account is credited with the former, which
      // is the money that actually belongs to the holder.
      amount: verified.data.amount,
      currency: verified.data.currency,
      detail: `Deposit confirmed by Flutterwave, ref ${verified.data.flwRef}.`,
      source: 'flutterwave',
    });

    return ok({
      reference,
      status: 'successful',
      amount: verified.data.amount,
      currency: verified.data.currency,
      /** False on a repeat call: already credited, not a failure. */
      credited,
      detail: credited
        ? 'Credited to the ledger.'
        : 'Already credited. This reference was recorded earlier.',
    });
  } catch (err) {
    return fail(err, 502);
  }
}
