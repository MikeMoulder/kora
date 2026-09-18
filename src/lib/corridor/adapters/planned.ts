/**
 * Corridors that are designed but not executable.
 *
 * This adapter is the honesty mechanism, and it is deliberately not a list of
 * strings in the UI. Pollar's rule for its own dashboard is that it "can never
 * enable a route with no code behind it". KORA enforces the same rule from the
 * other direction: a planned corridor is declared here with its real limits,
 * rail and blocker, so the interface can show the ambition — and every
 * execution verb throws `CorridorNotExecutable`.
 *
 * The result is that "Coming soon" is not a label someone remembered to add.
 * It is what the type system and the runtime both already enforce. You cannot
 * demo your way past it by clicking the wrong button.
 */

import type { KoraCorridor, KoraRailAdapter } from '../types';

const ADAPTER_ID = 'planned';

export class CorridorNotExecutable extends Error {
  readonly corridorId: string;
  readonly blocker: string;

  constructor(corridorId: string, blocker: string) {
    super(`Corridor ${corridorId} is declared but not executable: ${blocker}`);
    this.name = 'CorridorNotExecutable';
    this.corridorId = corridorId;
    this.blocker = blocker;
  }
}

/**
 * Each entry names the specific thing standing between design and execution.
 * "Coming soon" is not a blocker; a licence, an approval or a missing sandbox
 * is.
 */
const corridors: KoraCorridor[] = [
  {
    id: 'GH.GHS.MOMO.onramp',
    direction: 'onramp',
    country: 'GH',
    countryName: 'Ghana',
    flag: '🇬🇭',
    fiat: 'GHS',
    rail: 'MOMO',
    railLabel: 'Mobile Money (MTN / Telecel)',
    asset: 'USDC',
    chain: 'stellar',
    readiness: 'planned',
    adapterId: ADAPTER_ID,
    limits: { min: 10, max: 50_000 },
    estimatedTime: '1–3 minutes',
    readinessNote:
      'MTN MoMo’s collections API needs a Ghanaian entity and a signed partner agreement before sandbox credentials are issued.',
  },
  {
    id: 'UG.UGX.MOMO.onramp',
    direction: 'onramp',
    country: 'UG',
    countryName: 'Uganda',
    flag: '🇺🇬',
    fiat: 'UGX',
    rail: 'MOMO',
    railLabel: 'Mobile Money (MTN / Airtel)',
    asset: 'USDC',
    chain: 'stellar',
    readiness: 'planned',
    adapterId: ADAPTER_ID,
    limits: { min: 5_000, max: 20_000_000 },
    estimatedTime: '1–3 minutes',
    readinessNote:
      'Same MTN collections dependency as Ghana, plus a Bank of Uganda payment-service-provider licence for collections at volume.',
  },
  {
    id: 'ZA.ZAR.NIP.onramp',
    direction: 'onramp',
    country: 'ZA',
    countryName: 'South Africa',
    flag: '🇿🇦',
    fiat: 'ZAR',
    rail: 'NIP',
    railLabel: 'PayShap instant transfer',
    asset: 'USDC',
    chain: 'stellar',
    readiness: 'planned',
    adapterId: ADAPTER_ID,
    limits: { min: 50, max: 500_000 },
    estimatedTime: '1–5 minutes',
    readinessNote:
      'PayShap is bank-sponsored; access requires a sponsoring bank, and SARB exchange-control rules apply to the outbound leg.',
  },
  {
    id: 'NG.NGN.P2P.onramp',
    direction: 'onramp',
    country: 'NG',
    countryName: 'Nigeria',
    flag: '🇳🇬',
    fiat: 'NGN',
    rail: 'P2P',
    railLabel: 'Matched P2P counterparty',
    asset: 'USDC',
    chain: 'stellar',
    readiness: 'planned',
    adapterId: ADAPTER_ID,
    limits: { min: 5_000, max: 2_000_000 },
    estimatedTime: '5–20 minutes',
    readinessNote:
      'Needs an escrow contract and a counterparty liquidity pool. Designed against the same adapter interface; deliberately not simulated, because a fake P2P match would misrepresent the settlement risk that makes this rail hard.',
  },
  {
    id: 'NG.NGN.AGENT.onramp',
    direction: 'onramp',
    country: 'NG',
    countryName: 'Nigeria',
    flag: '🇳🇬',
    fiat: 'NGN',
    rail: 'AGENT',
    railLabel: 'Cash via agent',
    asset: 'USDC',
    chain: 'stellar',
    readiness: 'planned',
    adapterId: ADAPTER_ID,
    limits: { min: 1_000, max: 500_000 },
    estimatedTime: 'Same day',
    readinessNote:
      'Requires a physical agent network and float management. The adapter interface already fits it — an agent confirming cash is the same operator-confirmation path the NIP corridor uses today.',
  },
];

function refuse(corridorId: string): never {
  const corridor = corridors.find((c) => c.id === corridorId);
  throw new CorridorNotExecutable(
    corridorId,
    corridor?.readinessNote ?? 'No execution path is implemented for this corridor.',
  );
}

export const plannedAdapter: KoraRailAdapter = {
  id: ADAPTER_ID,
  displayName: 'Declared, not executable',
  settlementNote: 'Designed against the same interface. No settlement path implemented.',
  corridors,

  async getQuote(corridor) {
    refuse(corridor.id);
  },
  async createFundingRequest(corridor) {
    refuse(corridor.id);
  },
  async getFundingStatus() {
    throw new CorridorNotExecutable('unknown', 'Planned corridors hold no state.');
  },
};
