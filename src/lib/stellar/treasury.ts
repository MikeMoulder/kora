/**
 * KORA's treasury leg.
 *
 * KORA does not issue USDC — Circle does. KORA holds a float of it and
 * delivers from that float against naira it has already received. That is what
 * every remittance company does: take local currency on one side, pay out from
 * liquidity pre-positioned on the other. The naira and the USDC never touch
 * each other; they are two sides of a book that has to balance.
 *
 * So this module does one thing: move USDC from the treasury account to a
 * beneficiary's wallet, and report the transaction hash that proves it.
 *
 * Server only. The treasury secret signs real transactions.
 */

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  HORIZON_URL,
  SETTLEMENT_ASSET,
  STELLAR_NETWORK,
  USDC_ISSUER,
} from '@/lib/pollar/config';

if (typeof window !== 'undefined') {
  throw new Error('src/lib/stellar/treasury is server only. It holds a signing key.');
}

const TREASURY_SECRET = process.env.SETTLEMENT_SECRET ?? '';

const server = new Horizon.Server(HORIZON_URL);

const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

export function hasTreasury(): boolean {
  return TREASURY_SECRET.startsWith('S') && TREASURY_SECRET.length === 56;
}

function keypair(): Keypair {
  return Keypair.fromSecret(TREASURY_SECRET);
}

export function treasuryAddress(): string | null {
  return hasTreasury() ? keypair().publicKey() : null;
}

/** The asset the corridor actually settles in. */
function asset(): Asset {
  return SETTLEMENT_ASSET === 'XLM'
    ? Asset.native()
    : new Asset('USDC', USDC_ISSUER[STELLAR_NETWORK]);
}

export interface TreasuryBalance {
  asset: string;
  balance: number;
  /** XLM, which pays the fee regardless of what is being sent. */
  xlm: number;
}

/**
 * What the treasury can actually pay out.
 *
 * Two numbers, because they fail differently: no asset means "insufficient
 * balance of the asset being sent", no XLM means the submission never gets
 * that far.
 */
export async function treasuryBalance(): Promise<TreasuryBalance | null> {
  const address = treasuryAddress();
  if (!address) return null;

  try {
    const account = await server.loadAccount(address);

    const native = account.balances.find((b) => b.asset_type === 'native');
    const line =
      SETTLEMENT_ASSET === 'XLM'
        ? native
        : account.balances.find(
            (b) => 'asset_code' in b && b.asset_code === SETTLEMENT_ASSET,
          );

    return {
      asset: SETTLEMENT_ASSET,
      balance: line && 'balance' in line ? Number(line.balance) : 0,
      xlm: native && 'balance' in native ? Number(native.balance) : 0,
    };
  } catch {
    return null;
  }
}

export type PayoutResult =
  | { ok: true; hash: string; amount: string }
  | { ok: false; code: string; message: string };

/**
 * Deliver the asset to a beneficiary wallet.
 *
 * Amounts are formatted to seven decimal places because that is Stellar's
 * precision, and a longer string is rejected outright rather than rounded.
 *
 * The memo is the KORA reference, and it goes on the transaction. It used to
 * be accepted as an argument and then quietly dropped, which meant the on-chain
 * record and the account's record had nothing in common: `settle` passed the
 * reference in, and the only thing tying the two together afterwards was a row
 * in our own database saying so. A remittance receipt whose proof cannot be
 * matched back to the payment without trusting us is most of the way back to
 * being a screenshot.
 *
 * Truncated to Stellar's twenty-eight byte limit rather than left to be
 * rejected. References are fifteen characters, so this never fires today; it
 * exists so a longer prefix one day costs a shortened memo rather than a failed
 * payment that has already debited somebody.
 *
 * Every failure is returned rather than thrown. The caller has already debited
 * a person's balance by the time this runs, so it needs to know what went
 * wrong in order to reverse it, not catch an exception and guess.
 */
export async function payBeneficiary(
  destination: string,
  amount: number,
  memo?: string,
): Promise<PayoutResult> {
  if (!hasTreasury()) {
    return { ok: false, code: 'NO_TREASURY', message: 'No treasury key on the server.' };
  }

  const signer = keypair();
  const value = amount.toFixed(7);

  try {
    const account = await server.loadAccount(signer.publicKey());

    const builder = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    }).addOperation(
      Operation.payment({ destination, asset: asset(), amount: value }),
    );

    const tag = memo?.trim().slice(0, 28);
    if (tag) builder.addMemo(Memo.text(tag));

    const tx = builder.setTimeout(90).build();
    tx.sign(signer);

    const result = await server.submitTransaction(tx);
    return { ok: true, hash: result.hash, amount: value };
  } catch (err) {
    /*
     * Horizon puts the useful part in `extras.result_codes`, several layers
     * down. The operation code is the one that names the actual problem:
     * `op_underfunded` for an empty treasury, `op_no_trust` when the
     * beneficiary cannot hold the asset, `op_no_destination` for an account
     * that does not exist. Surfacing "Request failed" instead would make the
     * next person debug Horizon rather than the corridor.
     */
    const horizon = err as {
      response?: { data?: { extras?: { result_codes?: { transaction?: string; operations?: string[] } } } };
      message?: string;
    };

    const codes = horizon.response?.data?.extras?.result_codes;
    const op = codes?.operations?.find((c) => c && c !== 'op_success');

    return {
      ok: false,
      code: op ?? codes?.transaction ?? 'SUBMIT_FAILED',
      message: op
        ? `Stellar rejected the payment: ${op}.`
        : (horizon.message ?? 'Stellar rejected the payment.'),
    };
  }
}
