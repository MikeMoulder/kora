import { HORIZON_URL, STELLAR_NETWORK } from '@/lib/pollar/config';
import { fail, ok, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Top up a testnet wallet from Friendbot.
 *
 * Pollar sponsors the base reserve and the trustline of every wallet it
 * creates, so a new account exists and can hold USDC with no XLM of its own.
 * It still cannot pay a transaction fee. Unless the app is configured with a
 * starting balance, or fee sponsorship covers the submission, the first
 * transfer fails with "insufficient XLM to cover the network fee".
 *
 * That is not a problem the person signing in can be expected to solve, and
 * on a demo it is the difference between a corridor that completes and a dead
 * end at the last step. Friendbot is the standard testnet faucet, the XLM it
 * issues has no value, and this only ever runs against testnet.
 *
 * The proper fix is Dashboard, Treasury, Account Funding, which seeds every
 * new wallet. This exists so a wallet created before that was set can still
 * finish, rather than stranding whoever is holding it.
 */

/** Stellar public keys are 56 characters of base32 starting with G. */
const ADDRESS = /^G[A-Z2-7]{55}$/;

const FRIENDBOT = 'https://friendbot.stellar.org';

export async function POST(request: Request) {
  try {
    if (STELLAR_NETWORK !== 'testnet') {
      // There is no faucet for real money, and an endpoint that pretends
      // otherwise on mainnet would be a liability rather than a convenience.
      throw new Error('The faucet is testnet only.');
    }

    const { address } = await readJson<{ address?: string }>(request);

    if (!address || !ADDRESS.test(address)) {
      throw new Error('A Stellar public key is required.');
    }

    const response = await fetch(`${FRIENDBOT}/?addr=${encodeURIComponent(address)}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      // Friendbot rate limits, and it answers 400 for an account it has
      // already funded. Neither is worth a stack trace.
      throw new Error(
        `Friendbot declined (${response.status}). It rate limits, so wait a moment and try again.`,
      );
    }

    // Report what the account actually holds now rather than assuming.
    const account = await fetch(`${HORIZON_URL}/accounts/${address}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    const native = (account?.balances ?? []).find(
      (b: { asset_type?: string }) => b.asset_type === 'native',
    );

    return ok({
      address,
      balance: native?.balance ?? null,
      network: STELLAR_NETWORK,
    });
  } catch (err) {
    return fail(err);
  }
}
