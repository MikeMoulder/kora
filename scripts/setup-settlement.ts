/**
 * Creates the testnet account that stands in for Pollar's Bolivian settlement
 * wallet, funds it from Friendbot, and opens a USDC trustline so it can
 * actually receive the hand-off.
 *
 *   npm run setup:settlement
 *
 * Idempotent: pass an existing secret in SETTLEMENT_SECRET and it tops up and
 * re-checks the trustline instead of creating a new account.
 *
 * The point is that the address KORA hands off to is a real account with a
 * real balance on a public network, so the settlement can be checked on
 * stellar.expert by someone who does not trust us.
 */

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const HORIZON = 'https://horizon-testnet.stellar.org';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const ENV_FILE = '.env.local';

const server = new Horizon.Server(HORIZON);
const usdc = new Asset('USDC', USDC_ISSUER);

async function main() {
  const existing = process.env.SETTLEMENT_SECRET ?? readEnv('SETTLEMENT_SECRET');
  const keypair = existing ? Keypair.fromSecret(existing) : Keypair.random();
  const address = keypair.publicKey();

  console.log(existing ? 'Using existing settlement account' : 'Generated a new settlement account');
  console.log(`  ${address}\n`);

  // ── Fund ────────────────────────────────────────────────────────────────
  let account = await loadAccount(address);
  if (!account) {
    console.log('Funding from Friendbot…');
    const res = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    if (!res.ok) {
      throw new Error(`Friendbot refused (${res.status}). Try again in a moment.`);
    }
    account = await loadAccount(address);
    if (!account) throw new Error('Account still not visible on Horizon after funding.');
    console.log('  funded ✓');
  } else {
    console.log('Account already exists on testnet ✓');
  }

  const xlm = account.balances.find((b) => b.asset_type === 'native');
  console.log(`  XLM balance: ${xlm?.balance ?? '0'}`);

  // ── Trustline ───────────────────────────────────────────────────────────
  const hasUsdc = account.balances.some(
    (b) =>
      'asset_code' in b && b.asset_code === 'USDC' && 'asset_issuer' in b && b.asset_issuer === USDC_ISSUER,
  );

  if (hasUsdc) {
    const line = account.balances.find((b) => 'asset_code' in b && b.asset_code === 'USDC');
    console.log(`\nUSDC trustline already open ✓  (balance ${line && 'balance' in line ? line.balance : '0'})`);
  } else {
    console.log('\nOpening USDC trustline…');
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.changeTrust({ asset: usdc }))
      .setTimeout(60)
      .build();

    tx.sign(keypair);
    const result = await server.submitTransaction(tx);
    console.log(`  trustline opened ✓  ${result.hash}`);
    console.log(`  https://stellar.expert/explorer/testnet/tx/${result.hash}`);
  }

  // ── Report ──────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(64));
  console.log('Add these to .env.local:\n');
  console.log(`NEXT_PUBLIC_SETTLEMENT_ADDRESS=${address}`);
  if (!existing) console.log(`SETTLEMENT_SECRET=${keypair.secret()}`);
  console.log('\n' + '─'.repeat(64));
  console.log(`Account: https://stellar.expert/explorer/testnet/account/${address}`);

  if (!existing && !envHas('NEXT_PUBLIC_SETTLEMENT_ADDRESS')) {
    appendFileSync(
      ENV_FILE,
      `\n# Settlement account — created ${new Date().toISOString()} by scripts/setup-settlement.ts\n` +
        `NEXT_PUBLIC_SETTLEMENT_ADDRESS=${address}\n` +
        `SETTLEMENT_SECRET=${keypair.secret()}\n`,
    );
    console.log(`\nWritten to ${ENV_FILE} ✓`);
  }

  console.log(
    '\nNote: the account holds 0 USDC until Circle\'s testnet faucet issues some.\n' +
      'It can still receive the hand-off — the trustline is what matters for that.\n' +
      'If you cannot get testnet USDC, set NEXT_PUBLIC_SETTLEMENT_ASSET=XLM and the\n' +
      'corridor still runs end to end against a real on-chain transfer.',
  );
}

async function loadAccount(address: string) {
  try {
    return await server.loadAccount(address);
  } catch {
    return null;
  }
}

function readEnv(key: string): string | null {
  if (!existsSync(ENV_FILE)) return null;
  const line = readFileSync(ENV_FILE, 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith(`${key}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim() : null;
}

function envHas(key: string): boolean {
  return readEnv(key) !== null;
}

main().catch((err) => {
  console.error('\nSetup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
