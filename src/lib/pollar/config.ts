/**
 * Pollar + Stellar configuration.
 *
 * One module so that every "is this configured?" question has a single
 * answer, and so the UI can tell the user precisely what is missing instead
 * of failing somewhere deep in the SDK.
 */

export const POLLAR_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY ?? '';

export const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') as
  | 'testnet'
  | 'mainnet';

/**
 * Circle's USDC issuer.
 *
 * Testnet value verified against horizon-testnet (`home_domain: centre.io`) and
 * matches the issuer Pollar's own demo app uses for testnet escrow.
 */
export const USDC_ISSUER = {
  testnet: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  mainnet: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
} as const;

/**
 * The asset the hand-off actually moves.
 *
 * USDC is the real answer and the default. XLM exists as an escape hatch
 * because testnet USDC has to be issued to you — if the demo wallet has none,
 * the corridor should still be demonstrable end to end rather than dying at
 * the last step. Whichever is used, the UI names it; it never says "USDC"
 * while moving something else.
 */
export type SettlementAsset = 'USDC' | 'XLM';

export const SETTLEMENT_ASSET: SettlementAsset =
  (process.env.NEXT_PUBLIC_SETTLEMENT_ASSET as SettlementAsset) === 'XLM' ? 'XLM' : 'USDC';

export function settlementAssetParam() {
  return SETTLEMENT_ASSET === 'XLM'
    ? ({ type: 'native' } as const)
    : ({
        type: 'credit_alphanum4',
        code: 'USDC',
        issuer: USDC_ISSUER[STELLAR_NETWORK],
      } as const);
}

/**
 * Where the African leg hands off to.
 *
 * This stands in for Pollar's Bolivian settlement wallet. On testnet it is a
 * real funded account we control, so the transfer is a real transaction with
 * a real hash — the point of the hand-off is that it is verifiable, not that
 * it is pretty.
 */
export const SETTLEMENT_ADDRESS = process.env.NEXT_PUBLIC_SETTLEMENT_ADDRESS ?? '';

export const HORIZON_URL =
  STELLAR_NETWORK === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';

export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/${STELLAR_NETWORK}/tx/${hash}`;
}

export function explorerAccountUrl(address: string): string {
  return `https://stellar.expert/explorer/${STELLAR_NETWORK}/account/${address}`;
}

export interface ConfigGap {
  key: string;
  what: string;
  how: string;
}

/** What is missing, in the order it blocks the demo. */
export function configGaps(): ConfigGap[] {
  const gaps: ConfigGap[] = [];

  if (!POLLAR_PUBLISHABLE_KEY) {
    gaps.push({
      key: 'NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY',
      what: 'No Pollar publishable key, so no wallet and no hand-off.',
      how: 'dashboard.pollar.xyz → Build → API Keys → Generate → publishable, testnet.',
    });
  } else if (!POLLAR_PUBLISHABLE_KEY.startsWith('pub_')) {
    gaps.push({
      key: 'NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY',
      what: 'That key is not a publishable key. Secret keys must never reach the browser.',
      how: 'Use the pub_testnet_… key. Keep sec_… on the server.',
    });
  }

  if (!SETTLEMENT_ADDRESS) {
    gaps.push({
      key: 'NEXT_PUBLIC_SETTLEMENT_ADDRESS',
      what: 'No settlement address, so the hand-off has nowhere to land.',
      how: 'Run `npm run setup:settlement` to create and fund a testnet account.',
    });
  }

  return gaps;
}

export function isPollarConfigured(): boolean {
  return POLLAR_PUBLISHABLE_KEY.startsWith('pub_') && SETTLEMENT_ADDRESS.length > 0;
}
