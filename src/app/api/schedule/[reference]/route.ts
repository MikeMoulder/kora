import { schedule } from '@/lib/schedule/store';
import { reverse } from '@/lib/payments/settle';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cancel a scheduled payment.
 *
 * DELETE, and it deletes nothing. The naira left the balance when the payment
 * was scheduled, so cancelling is a movement rather than a removal: the record
 * moves to `cancelled` and a compensating credit goes on the ledger under the
 * same reference as the debit.
 *
 * That is the same `reverse` a failed delivery uses, and on purpose. Money
 * that went out and came back is one shape, whatever the reason, and the
 * sentence on the entry is the only part that differs.
 *
 * The transition is guarded on `held`, so a second click finds a payment that
 * is no longer held, does nothing, and answers 409 rather than crediting the
 * account twice. That guard lives in the store, which means neither this route
 * nor the runner has to remember it.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  try {
    const { reference } = await params;
    if (!reference) throw new Error('A reference is required.');

    const existing = await schedule.get(reference);
    if (!existing) throw new Error('No scheduled payment with that reference.');

    if (existing.status !== 'held') {
      throw new Error(
        existing.status === 'sent'
          ? 'That payment has already gone out and cannot be cancelled.'
          : `That payment is already ${existing.status}.`,
      );
    }

    /*
     * The record moves before the money.
     *
     * If the process dies between the two, what is left is a payment marked
     * cancelled whose naira is still off the balance. That is recoverable and
     * obvious: the ledger shows a debit with no matching credit.
     *
     * The other order is not recoverable in the same way. Crediting first and
     * dying leaves a payment still marked `held`, which the runner will pick
     * up on Friday and deliver, from money it has already given back.
     */
    const cancelled = await schedule.transition(reference, 'held', 'cancelled', {
      at: new Date().toISOString(),
      hash: null,
      explorer: null,
      delivered: null,
      message: 'Cancelled before it was due.',
    });

    if (!cancelled) {
      throw new Error('That payment stopped being cancellable while this request was in flight.');
    }

    await reverse(
      reference,
      existing.amount,
      `Scheduled payment to ${existing.recipient.name} cancelled before it was due.`,
    );

    return ok({ payment: cancelled });
  } catch (err) {
    return fail(err);
  }
}
