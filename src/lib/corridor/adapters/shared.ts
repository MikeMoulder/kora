/**
 * Helpers shared by the African rail adapters.
 *
 * Everything here exists to make an adapter's output indistinguishable in
 * shape from a Pollar ramp response, so the funding screen needs no
 * per-provider branches.
 */

import QRCode from 'qrcode';
import type {
  PollarDepositInstructions,
  PollarInstructionField,
  PollarScannable,
} from '../pollar-shapes';
import type { KoraCorridor, KoraQuote } from '../types';
import { getRate, round2, round7 } from '../rates';

/** Reference shown to the user and quoted on the bank transfer. */
export function makeReference(prefix = 'KORA'): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1
  let body = '';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) body += alphabet[b % alphabet.length];
  return `${prefix}-${body}`;
}

export function makeQuoteId(): string {
  return `kq_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/**
 * Build a KORA quote for a corridor.
 *
 * Fee model, stated plainly because the UI shows it:
 *   - a rail fee, the cost the local rail itself charges, per-adapter
 *   - a KORA spread in basis points on the converted amount
 * There is no hidden markup on the FX rate itself; `rate` is the mid-market
 * rate we fetched, attributed to its source.
 */
export async function buildQuote(params: {
  corridor: KoraCorridor;
  amount: number;
  provider: string;
  railFeeFiat: number;
  spreadBps: number;
  estimatedTime: string;
  recommended?: boolean;
  requiredFields?: KoraQuote['requiredFields'];
  ttlMinutes?: number;
}): Promise<KoraQuote> {
  const {
    corridor,
    amount,
    provider,
    railFeeFiat,
    spreadBps,
    estimatedTime,
    recommended = false,
    requiredFields = [],
    ttlMinutes = 15,
  } = params;

  const rate = await getRate(corridor.fiat);

  const spreadFiat = round2((amount * spreadBps) / 10_000);
  const totalFeeFiat = round2(railFeeFiat + spreadFiat);
  const netFiat = round2(amount - totalFeeFiat);
  const receiveUsdc = round7(netFiat / rate.perUsd);

  return {
    quoteId: makeQuoteId(),
    corridorId: corridor.id,
    provider,
    protocol: 'REST',
    rail: corridor.rail,
    amount,
    currency: corridor.fiat,
    rate: rate.perUsd,
    rateSource: rate.source,
    rateAsOf: rate.asOf,
    fee: totalFeeFiat,
    feeCurrency: corridor.fiat,
    receiveUsdc,
    estimatedTime,
    recommended,
    requiredFields,
    breakdown: [
      { label: 'You send', amount, currency: corridor.fiat },
      {
        label: `${corridor.railLabel} fee`,
        amount: -railFeeFiat,
        currency: corridor.fiat,
        note: 'Charged by the local rail',
      },
      {
        label: `KORA spread (${(spreadBps / 100).toFixed(2)}%)`,
        amount: -spreadFiat,
        currency: corridor.fiat,
        note: 'No markup is applied to the FX rate itself',
      },
      {
        label: 'Converted at mid-market',
        amount: netFiat,
        currency: corridor.fiat,
        note: `1 USDC = ${rate.perUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${corridor.fiat} · ${rate.source}`,
      },
    ],
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
  };
}

export function field(
  key: PollarInstructionField['key'],
  label: string,
  value: string,
  type: PollarInstructionField['type'] = 'text',
  copyable = true,
): PollarInstructionField {
  return { key, label, value, type, copyable };
}

/** Standard trailer every adapter appends: amount, currency, rail, reference, expiry. */
export function commonFields(
  quote: KoraQuote,
  corridor: KoraCorridor,
  reference: string,
  expiresAt: string,
): PollarInstructionField[] {
  return [
    field(
      'amount',
      'Exact amount',
      `${quote.amount.toLocaleString()} ${quote.currency}`,
      'amount',
    ),
    field('currency', 'Currency', quote.currency, 'text', false),
    field('rail', 'Rail', corridor.railLabel, 'text', false),
    field('reference', 'Reference — must be included', reference, 'code'),
    field('expires_at', 'Quote expires', expiresAt, 'datetime', false),
  ];
}

/**
 * Render a scannable in Pollar's shape. `inlineSafe` SVGs use `currentColor`
 * so the host theme drives them, exactly as Pollar documents for its own.
 */
export async function makeScannable(
  kind: PollarScannable['kind'],
  payload: string,
  payloadLabel: string | null,
): Promise<PollarScannable> {
  const svg = await QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: '#000000', light: '#00000000' },
  });
  // The library paints the modules with `stroke` on a single <path>, not
  // `fill`. Swap whichever it used for `currentColor` so the code inherits the
  // host's text colour — Pollar's own `inlineSafe` SVGs behave this way, and
  // the contract is only honoured if the markup actually does it.
  const themed = svg
    .replace(/(stroke|fill)="#000000"/gi, '$1="currentColor"')
    .replace(/shape-rendering="crispEdges"/, 'shape-rendering="crispEdges" role="img"');

  return {
    kind,
    payload,
    payloadLabel,
    image: {
      mediaType: 'image/svg+xml',
      encoding: 'utf8',
      data: themed,
      inlineSafe: true,
    },
  };
}

export function instructions(
  fields: PollarInstructionField[],
  scannable?: PollarScannable,
): PollarDepositInstructions {
  return scannable ? { scannable, fields } : { fields };
}
