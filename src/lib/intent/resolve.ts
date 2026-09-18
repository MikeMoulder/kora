/**
 * Intent → corridor.
 *
 * The gate between the language layer and the money layer. Everything the
 * model produced is treated as a suggestion and checked against the registry
 * here. A corridor that the registry does not declare cannot come out of this
 * function, whatever the sentence said.
 */

import { corridors, isExecutable } from '../corridor/registry';
import type { KoraCorridor } from '../corridor/types';
import type { PaymentIntent } from './types';

export type ResolutionStatus =
  | 'ready'
  | 'needs_detail'
  | 'no_corridor'
  | 'not_executable'
  | 'out_of_range';

export interface Resolution {
  status: ResolutionStatus;
  /** Corridors matching the funding side, executable ones first. */
  candidates: KoraCorridor[];
  /** The one we would default to. Null unless `status === 'ready'`. */
  selected: KoraCorridor | null;
  /** Plain-language explanation, safe to show the user verbatim. */
  message: string;
  /** The destination leg, for display. Bolivia is Pollar's to settle. */
  destination: { country: string; settledBy: 'pollar' | 'unsupported' } | null;
}

/** Countries Pollar can actually land money in, from its ramp registry. */
const POLLAR_DESTINATIONS = new Set(['BO', 'BR', 'CO', 'MX']);

export function resolveIntent(intent: PaymentIntent): Resolution {
  const destination = intent.destinationCountry
    ? {
        country: intent.destinationCountry,
        settledBy: POLLAR_DESTINATIONS.has(intent.destinationCountry)
          ? ('pollar' as const)
          : ('unsupported' as const),
      }
    : null;

  if (intent.amount === null || !intent.currency) {
    return {
      status: 'needs_detail',
      candidates: [],
      selected: null,
      destination,
      message: 'Tell me how much to send, and in which currency.',
    };
  }

  if (!intent.destinationCountry) {
    return {
      status: 'needs_detail',
      candidates: [],
      selected: null,
      destination,
      message: 'Tell me which country the money is going to.',
    };
  }

  // Match on the funding side: the currency the sender named, and their
  // country when they gave one.
  const matching = corridors.filter((c) => {
    if (c.direction !== 'onramp') return false;
    if (c.fiat !== intent.currency) return false;
    if (intent.sourceCountry && c.country !== intent.sourceCountry) return false;
    return true;
  });

  const candidates = [...matching].sort((a, b) => {
    const rank = (c: KoraCorridor) =>
      c.readiness === 'live' ? 0 : c.readiness === 'sandbox' ? 1 : 2;
    return rank(a) - rank(b);
  });

  if (candidates.length === 0) {
    return {
      status: 'no_corridor',
      candidates: [],
      selected: null,
      destination,
      message: `KORA has no funding corridor for ${intent.currency}${
        intent.sourceCountry ? ` from ${intent.sourceCountry}` : ''
      } yet.`,
    };
  }

  const executable = candidates.filter(isExecutable);

  if (executable.length === 0) {
    const first = candidates[0];
    return {
      status: 'not_executable',
      candidates,
      selected: null,
      destination,
      message:
        first.readinessNote ??
        `The ${first.countryName} ${first.railLabel} corridor is designed but not executable yet.`,
    };
  }

  const selected = executable[0];

  if (intent.amount < selected.limits.min || intent.amount > selected.limits.max) {
    return {
      status: 'out_of_range',
      candidates,
      selected: null,
      destination,
      message:
        `${selected.countryName} ${selected.railLabel} accepts ` +
        `${selected.limits.min.toLocaleString()}–${selected.limits.max.toLocaleString()} ${selected.fiat}. ` +
        `You asked for ${intent.amount.toLocaleString()} ${intent.currency}.`,
    };
  }

  return {
    status: 'ready',
    candidates,
    selected,
    destination,
    message:
      destination?.settledBy === 'pollar'
        ? `Funding through ${selected.countryName} ${selected.railLabel}, settling in ${intent.destinationCountry} via Pollar.`
        : `Funding through ${selected.countryName} ${selected.railLabel}. Pollar has no ramp into ${intent.destinationCountry}, so the recipient would need to hold USDC.`,
  };
}
