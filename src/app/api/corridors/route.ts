import {
  POLLAR_CORRIDORS,
  POLLAR_RAILS,
  corridorsByCountry,
  coverageSummary,
  adapters,
  koraRails,
} from '@/lib/corridor/registry';
import { ok } from '@/lib/api';

export const runtime = 'nodejs';

export async function GET() {
  return ok({
    countries: corridorsByCountry(),
    coverage: coverageSummary(),
    koraRails: koraRails(),
    pollarRails: POLLAR_RAILS,
    pollarCorridors: POLLAR_CORRIDORS,
    adapters: adapters.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      settlementNote: a.settlementNote,
      corridorCount: a.corridors.length,
    })),
  });
}
