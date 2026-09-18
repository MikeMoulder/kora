import { getRate } from '@/lib/corridor/rates';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';

/**
 * African cross-rates, quoted against the naira.
 *
 * Quoted per 1,000 NGN rather than per 1. A single naira buys 0.0086 cedi,
 * which is a true number and a useless one on a dashboard. Per thousand puts
 * every currency in a range a person can actually read at a glance.
 */
const BASE = 'NGN';
const PER = 1_000;

const CURRENCIES = [
  { code: 'KES', name: 'Kenya Shilling', symbol: 'KSh', country: 'KE' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH\u20b5', country: 'GH' },
  { code: 'ZAR', name: 'SA Rand', symbol: 'R', country: 'ZA' },
  { code: 'UGX', name: 'Uganda Shilling', symbol: 'USh', country: 'UG' },
] as const;

/**
 * The currencies a beneficiary is actually paid out in. Quoted per single
 * naira rather than per thousand, because the send panel multiplies by a
 * typed amount rather than displaying the rate as a headline.
 */
const PAYOUT_CURRENCIES = [
  { code: 'BOB', name: 'Boliviano', symbol: 'Bs', country: 'BO' },
  { code: 'COP', name: 'Colombian Peso', symbol: '$', country: 'CO' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', country: 'BR' },
] as const;

export async function GET() {
  try {
    const base = await getRate(BASE);

    const payouts = await Promise.all(
      PAYOUT_CURRENCIES.map(async (currency) => {
        const target = await getRate(currency.code);
        return { ...currency, perNaira: target.perUsd / base.perUsd };
      }),
    );

    return ok({
      base: BASE,
      /** Naira per US dollar, for the peg line on the balance card. */
      basePerUsd: base.perUsd,
      asOf: base.asOf,
      source: base.source,
      stale: base.stale,
      payouts,
    });
  } catch (err) {
    return fail(err, 502);
  }
}
