/**
 * Intent → corridor.
 *
 * The gate between the language layer and the money layer. Everything the
 * model produced is treated as a suggestion and checked against the registry
 * here. A corridor that the registry does not declare cannot come out of this
 * function, whatever the sentence said.
 */

import { corridors, isExecutable, POLLAR_CORRIDORS } from '../corridor/registry';
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
  destination: {
    country: string;
    /**
     * The country's name, when we have one. Null for a code we do not
     * recognise, which the caller renders as the code rather than as a guess.
     */
    countryName: string | null;
    settledBy: 'pollar' | 'unsupported';
  } | null;
}

/**
 * Countries Pollar can land money in, and what they are called.
 *
 * Derived from `POLLAR_CORRIDORS` rather than listed here. The list used to be
 * a hand-written `Set(['BO', 'BR', 'CO', 'MX'])` sitting a few files away from
 * the table it was copied out of, which is two places to update when Pollar
 * adds a ramp and one of them with nothing to remind you.
 *
 * It carries the name as well as the code because the interface needs the
 * name. The resolver is the last thing in the chain that knows both, so the
 * alternative is a second country table in the browser.
 */
const POLLAR_DESTINATIONS = new Map(
  POLLAR_CORRIDORS.map((row) => [row.country, row.countryName]),
);

export function resolveIntent(intent: PaymentIntent): Resolution {
  const destination = intent.destinationCountry
    ? {
        country: intent.destinationCountry,
        countryName: POLLAR_DESTINATIONS.get(intent.destinationCountry) ?? null,
        settledBy: POLLAR_DESTINATIONS.has(intent.destinationCountry)
          ? ('pollar' as const)
          : ('unsupported' as const),
      }
    : null;

  /**
   * What to call the destination in a sentence somebody reads.
   *
   * An ISO code is the right thing to hold and the wrong thing to print.
   * "Settling in BO via Pollar" was shipping a field name to the person
   * paying. Falls back to the code when the country is one Pollar does not
   * serve, because at that point the sentence is already telling them there is
   * no ramp and inventing a name for it adds nothing.
   */
  const where = destination?.countryName ?? intent.destinationCountry;

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
        ? `Funding through ${selected.countryName} ${selected.railLabel}, settling in ${where} via Pollar.`
        : `Funding through ${selected.countryName} ${selected.railLabel}. Pollar has no ramp into ${where}, so the recipient would need to hold USDC.`,
  };
}
