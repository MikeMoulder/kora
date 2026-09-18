/**
 * Shapes mirrored from Pollar's ramp API.
 *
 * These are transcribed from the OpenAPI-generated types shipped inside
 * `@pollar/core@0.11.3` (`dist/index.d.ts`, the `postRampsOnramp` /
 * `getRampsQuote` / `getRampsCountries` operations). We re-declare them here
 * rather than importing them because Pollar's are deeply nested accessor types
 * (`paths['/ramps/onramp']['post'][...]`) that cannot be extended, and because
 * KORA must be able to emit these shapes for corridors Pollar's backend has
 * never heard of.
 *
 * The point of mirroring rather than inventing: a screen that can render a
 * Pollar `RampDepositInstructions` can render a KORA one without knowing which
 * produced it. Pollar's own docs describe that contract:
 *
 *   "How to pay, in one shape for every provider. `fields` arrive labelled and
 *    formatted: iterate and display, no per-provider knowledge needed."
 *
 * KORA is just another provider.
 */

/**
 * Pollar's rail enum, verbatim, as of 0.11.3.
 *
 * SPEI  — Mexico, interbank transfer
 * PIX   — Brazil, instant payment
 * PSE   — Colombia, bank debit
 * ACH   — Bolivia (Stereum sell leg)
 * BREB  — Colombia, instant payment
 * QR    — Bolivia (Stereum buy leg), bank QR
 *
 * Six rails. Every one of them Latin American. There is no African rail in
 * Pollar's type system, which is the precise, checkable statement of the gap
 * KORA fills. `KoraRail` below extends this set rather than replacing it.
 */
export type PollarRail = 'SPEI' | 'PIX' | 'PSE' | 'ACH' | 'BREB' | 'QR';

export type PollarRampProtocol = 'SEP-24' | 'REST';

export type PollarRampDirection = 'onramp' | 'offramp';

export type PollarRampStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * The key set Pollar allows on a deposit-instruction field. Note that it
 * already contains everything a Nigerian bank transfer needs — `bank_name`,
 * `bank_account`, `account_holder`, `reference`, `amount`, `currency`, `rail`,
 * `expires_at`. We did not have to widen it.
 */
export type PollarInstructionFieldKey =
  | 'amount'
  | 'currency'
  | 'rail'
  | 'reference'
  | 'expires_at'
  | 'status_page'
  | 'account_holder'
  | 'bank_name'
  | 'bank_address'
  | 'bank_account'
  | 'bank_routing'
  | 'iban'
  | 'bic'
  | 'clabe'
  | 'deposit_address'
  | 'memo';

export type PollarInstructionFieldType = 'text' | 'code' | 'amount' | 'datetime' | 'url';

export interface PollarInstructionField {
  key: PollarInstructionFieldKey;
  label: string;
  value: string;
  type: PollarInstructionFieldType;
  copyable: boolean;
}

export interface PollarScannable {
  kind: 'pix' | 'stellar' | 'url' | 'opaque';
  payload: string | null;
  payloadLabel: string | null;
  image: {
    mediaType: 'image/svg+xml' | 'image/png';
    encoding: 'utf8' | 'base64';
    data: string;
    inlineSafe: boolean;
  };
}

/**
 * The provider-agnostic "how to pay" payload. A KORA adapter returns this and
 * nothing else — no bespoke per-rail render logic downstream.
 */
export interface PollarDepositInstructions {
  scannable?: PollarScannable;
  fields: PollarInstructionField[];
}

/** A required-field descriptor, as returned on a Pollar quote. */
export interface PollarRequiredField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'select';
  bankType?: 'CLABE' | 'PIX' | 'PSE' | 'ACH' | 'BREB';
  options?: { value: string; label: string }[];
}
