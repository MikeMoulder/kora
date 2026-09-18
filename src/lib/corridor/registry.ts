/**
 * The corridor registry.
 *
 * The single place the rest of the app learns what KORA can do. Nothing
 * downstream hardcodes a country or a rail: the UI renders whatever the
 * adapters declare, which is what keeps the capability matrix honest as the
 * adapter set changes.
 */

import { kenyaMpesaAdapter } from './adapters/kenya-mpesa';
import { nigeriaNipAdapter } from './adapters/nigeria-nip';
import { CorridorNotExecutable, plannedAdapter } from './adapters/planned';
import type { KoraCorridor, KoraRailAdapter } from './types';
import type { PollarRail } from './pollar-shapes';

export const adapters: KoraRailAdapter[] = [
  nigeriaNipAdapter,
  kenyaMpesaAdapter,
  plannedAdapter,
];

export const corridors: KoraCorridor[] = adapters.flatMap((a) => a.corridors);

export function getCorridor(id: string): KoraCorridor {
  const corridor = corridors.find((c) => c.id === id);
  if (!corridor) throw new Error(`Unknown corridor ${id}`);
  return corridor;
}

export function getAdapter(corridor: KoraCorridor): KoraRailAdapter {
  const adapter = adapters.find((a) => a.id === corridor.adapterId);
  if (!adapter) throw new Error(`No adapter registered for ${corridor.id}`);
  return adapter;
}

export function getAdapterById(id: string): KoraRailAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

/** True when a corridor has an execution path. Used to gate the UI. */
export function isExecutable(corridor: KoraCorridor): boolean {
  return corridor.readiness === 'live' || corridor.readiness === 'sandbox';
}

/** Throws `CorridorNotExecutable` rather than letting a planned route proceed. */
export function assertExecutable(corridor: KoraCorridor): void {
  if (!isExecutable(corridor)) {
    throw new CorridorNotExecutable(
      corridor.id,
      corridor.readinessNote ?? 'No execution path is implemented.',
    );
  }
}

export interface CountryGroup {
  country: string;
  countryName: string;
  flag: string;
  fiat: string;
  corridors: KoraCorridor[];
}

/** Grouped for the rail map. Countries with an executable corridor come first. */
export function corridorsByCountry(): CountryGroup[] {
  const groups = new Map<string, CountryGroup>();

  for (const corridor of corridors) {
    const existing = groups.get(corridor.country);
    if (existing) {
      existing.corridors.push(corridor);
    } else {
      groups.set(corridor.country, {
        country: corridor.country,
        countryName: corridor.countryName,
        flag: corridor.flag,
        fiat: corridor.fiat,
        corridors: [corridor],
      });
    }
  }

  return [...groups.values()].sort((a, b) => {
    const aLive = a.corridors.some(isExecutable) ? 0 : 1;
    const bLive = b.corridors.some(isExecutable) ? 0 : 1;
    return aLive - bLive || a.countryName.localeCompare(b.countryName);
  });
}

/**
 * Pollar's own corridor coverage, transcribed from its operator docs
 * (Integrations → Ramps, "Supported providers" table) on 2026-09-17.
 *
 * Kept here so the UI can show the two registries side by side. When an API
 * key is present the app also calls the live `getRampCountries()` and shows
 * that instead — this table is the offline fallback and the citation.
 */
export interface PollarCorridorRow {
  provider: string;
  direction: string;
  country: string;
  countryName: string;
  flag: string;
  fiat: string;
  rail: PollarRail;
}

export const POLLAR_CORRIDORS: PollarCorridorRow[] = [
  { provider: 'Bridge', direction: 'Buy, Sell', country: 'BR', countryName: 'Brazil', flag: '🇧🇷', fiat: 'BRL', rail: 'PIX' },
  { provider: 'PagFinance', direction: 'Buy', country: 'BR', countryName: 'Brazil', flag: '🇧🇷', fiat: 'BRL', rail: 'PIX' },
  { provider: 'Abroad Finance', direction: 'Sell', country: 'BR', countryName: 'Brazil', flag: '🇧🇷', fiat: 'BRL', rail: 'PIX' },
  { provider: 'Abroad Finance', direction: 'Sell', country: 'CO', countryName: 'Colombia', flag: '🇨🇴', fiat: 'COP', rail: 'BREB' },
  { provider: 'Etherfuse', direction: 'Buy, Sell', country: 'MX', countryName: 'Mexico', flag: '🇲🇽', fiat: 'MXN', rail: 'SPEI' },
  { provider: 'Stereum', direction: 'Buy', country: 'BO', countryName: 'Bolivia', flag: '🇧🇴', fiat: 'BOB', rail: 'QR' },
  { provider: 'Stereum', direction: 'Sell', country: 'BO', countryName: 'Bolivia', flag: '🇧🇴', fiat: 'BOB', rail: 'ACH' },
];

/** Pollar's rail enum as shipped in 0.11.3 — all six, all Latin American. */
export const POLLAR_RAILS: PollarRail[] = ['SPEI', 'PIX', 'PSE', 'ACH', 'BREB', 'QR'];

/** The rails KORA adds. Derived from the registry, never hand-listed. */
export function koraRails(): string[] {
  return [...new Set(corridors.map((c) => c.rail))].filter(
    (r) => !POLLAR_RAILS.includes(r as PollarRail),
  );
}

export function coverageSummary() {
  const executable = corridors.filter(isExecutable);
  return {
    koraCorridors: corridors.length,
    koraExecutable: executable.length,
    koraCountries: new Set(corridors.map((c) => c.country)).size,
    pollarCorridors: POLLAR_CORRIDORS.length,
    pollarCountries: new Set(POLLAR_CORRIDORS.map((c) => c.country)).size,
    pollarAfricanCorridors: POLLAR_CORRIDORS.filter((c) =>
      ['NG', 'KE', 'GH', 'UG', 'ZA', 'TZ'].includes(c.country),
    ).length,
  };
}

export { CorridorNotExecutable };
