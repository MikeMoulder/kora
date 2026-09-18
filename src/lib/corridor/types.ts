/**
 * The KORA corridor model.
 *
 * Pollar defines the unit of a ramp in its own operator docs:
 *
 *   "The real unit of a ramp is the corridor: direction + country + fiat + rail
 *    + the on-chain asset the user ends up with. Corridors are seeded from what
 *    the backend can actually execute ... so the dashboard can never enable a
 *    route with no code behind it."
 *
 * KORA adopts that definition literally, including the second sentence — which
 * is the load-bearing one. A corridor here is not a marketing tile; it is
 * declared by an adapter that has code behind it, and the engine refuses to
 * execute a corridor whose adapter says it cannot.
 */

import type {
  PollarDepositInstructions,
  PollarRail,
  PollarRampDirection,
  PollarRampProtocol,
  PollarRampStatus,
  PollarRequiredField,
} from './pollar-shapes';

/**
 * African rails, added to Pollar's six Latin American ones.
 *
 * NIP    — Nigeria Inter-Bank Settlement System instant transfer
 * MOMO   — GSMA-style mobile money (MTN, AirtelTigo, Vodafone Cash)
 * MPESA  — Safaricom M-Pesa (kept distinct from MOMO: different API surface,
 *          different settlement semantics, different regulator)
 * P2P    — matched local counterparty settling into the user's bank
 * AGENT  — cash handed to a human agent at a kiosk
 */
export type AfricanRail = 'NIP' | 'MOMO' | 'MPESA' | 'P2P' | 'AGENT';

export type KoraRail = PollarRail | AfricanRail;

/**
 * How far a corridor actually is. This is the honesty mechanism.
 *
 * `live`    — the adapter executes it end to end against a real dependency.
 * `sandbox` — the adapter executes the full state machine, but settlement is
 *             simulated because the underlying rail has no testnet. Pollar's
 *             own SEP-24 fiat deposit is in exactly this state
 *             ("Fiat on-ramp via Anclap testnet — coming soon"), so on testnet
 *             this is the honest ceiling for any fiat leg, ours or theirs.
 * `planned` — designed and typed, no execution path. The engine will throw if
 *             asked to run it. It can never silently appear to work.
 */
export type CorridorReadiness = 'live' | 'sandbox' | 'planned';

export interface KoraCorridor {
  /** Stable id, e.g. `NG.NGN.NIP.onramp`. */
  id: string;
  direction: PollarRampDirection;
  /** ISO 3166-1 alpha-2. */
  country: string;
  countryName: string;
  flag: string;
  /** ISO 4217. */
  fiat: string;
  rail: KoraRail;
  railLabel: string;
  /** What the user ends up holding. Always USDC on Stellar for now. */
  asset: 'USDC';
  chain: 'stellar';
  readiness: CorridorReadiness;
  /** Which adapter declared this corridor. */
  adapterId: string;
  limits: { min: number; max: number };
  /** Human estimate, mirroring Pollar's free-text `estimatedTime`. */
  estimatedTime: string;
  /**
   * Why this corridor is not `live`, in one sentence. Required for anything
   * that is not `live` so the UI never has to invent an excuse.
   */
  readinessNote?: string;
}

export interface KoraQuoteRequest {
  corridorId: string;
  /** Amount in the corridor's fiat, major units. */
  amount: number;
}

/**
 * Deliberately field-for-field with Pollar's quote shape, plus `corridorId`
 * and an itemised `breakdown` (Pollar returns a single `fee`; KORA shows the
 * user where every unit went, which is a product requirement, not an API one).
 */
export interface KoraQuote {
  quoteId: string;
  corridorId: string;
  provider: string;
  protocol: PollarRampProtocol;
  rail: KoraRail;
  /** Fiat in. */
  amount: number;
  currency: string;
  /** Fiat per 1 USDC. */
  rate: number;
  rateSource: string;
  rateAsOf: string;
  fee: number;
  feeCurrency: string;
  /** USDC the wallet will actually receive. */
  receiveUsdc: number;
  estimatedTime: string;
  recommended: boolean;
  requiredFields: PollarRequiredField[];
  breakdown: { label: string; amount: number; currency: string; note?: string }[];
  expiresAt: string;
}

export type FundingStatus =
  | 'awaiting_payment'
  | 'payment_reported'
  | 'confirming'
  | 'funded'
  | 'expired'
  | 'failed';

export interface KoraFundingRequest {
  /** KORA's own reference, shown to the user and quoted on the transfer. */
  reference: string;
  corridorId: string;
  quoteId: string;
  status: FundingStatus;
  amount: number;
  currency: string;
  receiveUsdc: number;
  /** Pollar-shaped. Rendered by the same component that renders a Pollar ramp. */
  instructions: PollarDepositInstructions;
  createdAt: string;
  expiresAt: string;
  /**
   * True when a human has to confirm receipt because the rail exposes no
   * programmatic webhook. Surfaced in the UI verbatim — never hidden.
   */
  requiresOperatorConfirmation: boolean;
  /**
   * Who is actually collecting the money.
   *
   * Absent when the rail has no partner behind it. Present, and named, when
   * one is issuing the account, because "a real partner issued this account"
   * and "we printed an account" are different claims and the interface should
   * never blur them.
   */
  settlement?: {
    provider: 'flutterwave' | 'simulated';
    mode: 'test' | 'live' | 'simulated';
    /** The partner's own handle for this collection, for reconciliation. */
    partnerReference?: string;
  };
}

export interface KoraFundingState {
  reference: string;
  status: FundingStatus;
  /** Ordered, append-only. Drives the timeline UI. */
  events: { at: string; status: FundingStatus; detail: string }[];
  /** Set once funded. */
  fundedAmountUsdc?: number;
}

/**
 * What every African rail must implement.
 *
 * Intentionally the same four verbs the Pollar ramp client exposes
 * (`getRampsQuote` / `createOnRamp` / `getRampTransaction` / `completeWithdraw`),
 * so the engine above it is rail-agnostic and a future real integration is a
 * drop-in replacement for a sandbox one.
 */
export interface KoraRailAdapter {
  readonly id: string;
  readonly displayName: string;
  /** Short line on who actually settles the money. Shown in the UI. */
  readonly settlementNote: string;
  /**
   * The capability matrix. The registry exposes exactly this and nothing more,
   * so the UI cannot advertise a route the adapter did not declare.
   */
  readonly corridors: KoraCorridor[];

  getQuote(corridor: KoraCorridor, amount: number): Promise<KoraQuote>;
  createFundingRequest(corridor: KoraCorridor, quote: KoraQuote): Promise<KoraFundingRequest>;
  getFundingStatus(reference: string): Promise<KoraFundingState>;
  /** Semi-manual confirmation path. Absent on rails that confirm themselves. */
  confirmFunding?(reference: string): Promise<KoraFundingState>;
}

/** Maps a KORA funding status onto Pollar's ramp status vocabulary. */
export function toPollarStatus(s: FundingStatus): PollarRampStatus {
  switch (s) {
    case 'awaiting_payment':
      return 'pending';
    case 'payment_reported':
    case 'confirming':
      return 'processing';
    case 'funded':
      return 'completed';
    case 'expired':
    case 'failed':
      return 'failed';
  }
}
