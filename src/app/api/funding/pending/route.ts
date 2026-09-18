import { store } from '@/lib/corridor/store';
import { getCorridor } from '@/lib/corridor/registry';
import { ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The operator queue.
 *
 * Every funding request this instance knows about, newest first, annotated
 * with its corridor. In production this is behind operator auth and scoped to
 * the operator's country; here it is open because the whole point is that a
 * judge can watch the semi-manual step happen.
 */
export async function GET() {
  const records = await store.list();

  const rows = records
    .map((record) => {
      let corridor = null;
      try {
        corridor = getCorridor(record.request.corridorId);
      } catch {
        // A corridor removed from the registry should not break the queue.
      }
      return {
        request: record.request,
        state: record.state,
        corridor: corridor && {
          id: corridor.id,
          country: corridor.country,
          countryName: corridor.countryName,
          railLabel: corridor.railLabel,
          readiness: corridor.readiness,
        },
      };
    })
    .sort(
      (a, b) =>
        new Date(b.request.createdAt).getTime() - new Date(a.request.createdAt).getTime(),
    );

  return ok({
    rows,
    counts: {
      total: rows.length,
      awaiting: rows.filter((r) => r.state.status === 'awaiting_payment').length,
      reported: rows.filter((r) => r.state.status === 'payment_reported').length,
      funded: rows.filter((r) => r.state.status === 'funded').length,
    },
  });
}
