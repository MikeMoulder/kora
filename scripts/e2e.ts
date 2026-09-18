/**
 * The whole corridor, end to end, against a running server.
 *
 *   npm run dev
 *   npm run e2e            # 1,000 NGN, the corridor minimum
 *   npm run e2e -- 2000
 *
 * `npm run smoke` proves the African leg in isolation with no network and no
 * money: parsing, routing, quoting, the capability matrix. This proves the
 * other thing, which is that the legs join up. It spends real testnet USDC out
 * of KORA's float and writes to the real ledger, so it is deliberately not
 * part of the default test run.
 *
 * Every assertion here is made against something outside the app. Balances
 * come from Horizon rather than from our own response, the wallet is confirmed
 * with Pollar, and the boliviano leg carries the status code Pollar answered
 * with on this run. An end-to-end test that only reads its own output proves
 * that the code is self-consistent, which is not the question.
 *
 * What it cannot prove is the last mile, and it says so rather than skipping
 * it: the off-ramp belongs to the beneficiary and Bolivia has no testnet
 * anchor. That leg is asserted to be *declared* simulated, which is the only
 * honest thing left to check.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const HORIZON = 'https://horizon-testnet.stellar.org';
const AMOUNT = Number(process.argv[2] ?? 1000);

const RECIPIENT = { name: 'Carlos Mamani', country: 'BO', countryName: 'Bolivia' };

let ran = 0;
let failed = 0;
const notes: string[] = [];

function check(label: string, condition: boolean, detail?: string) {
  ran += 1;
  if (!condition) failed += 1;
  console.log(`[${condition ? '  ok  ' : ' FAIL '}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function heading(text: string) {
  console.log(`\n\x1b[1m${text}\x1b[0m`);
}

function note(text: string) {
  notes.push(text);
  console.log(`         ${text}`);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });

  const body = await response.json();
  if (!body.ok) throw new Error(`${path}: ${body.error ?? response.status}`);
  return body.data as T;
}

/** A USDC balance straight off Horizon. Null when the account does not exist yet. */
async function usdcBalance(address: string): Promise<number | null> {
  const response = await fetch(`${HORIZON}/accounts/${address}`, { cache: 'no-store' });
  if (!response.ok) return null;

  const account = (await response.json()) as {
    balances: { asset_code?: string; balance: string }[];
  };

  const line = account.balances.find((b) => b.asset_code === 'USDC');
  return line ? Number(line.balance) : 0;
}

/** Seven decimal places is Stellar's precision; compare there, not on floats. */
function sameToStroops(a: number, b: number): boolean {
  return Math.abs(Math.round(a * 1e7) - Math.round(b * 1e7)) <= 1;
}

async function main() {
  console.log(`\n\x1b[1mKORA end to end\x1b[0m  ${BASE}  ${AMOUNT.toLocaleString()} NGN\n`);

  // ── 1. Readiness ────────────────────────────────────────────────────────
  heading('1. Pollar is reachable and can provision');

  const status = await api<{
    network: string;
    checks: { id: string; state: string; detail: string }[];
    summary: { backend: string; browser: string };
  }>('/api/pollar/status?deep=1');

  check('network is testnet', status.network === 'testnet', status.network);
  for (const c of status.checks) {
    check(`${c.id} passes`, c.state === 'pass', c.detail.slice(0, 80));
  }

  // ── 2. Rates ────────────────────────────────────────────────────────────
  heading('2. FX is live, not pinned');

  const rates = await api<{
    basePerUsd: number;
    source: string;
    asOf: string;
    stale: boolean;
    payouts: { code: string; perNaira: number }[];
  }>('/api/rates');

  check('a naira rate exists', rates.basePerUsd > 0, `1 USD = ${rates.basePerUsd} NGN`);
  check('it is not the cached snapshot', !rates.stale, rates.source);
  note(`as of ${rates.asOf}`);

  // ── 3. Quote ────────────────────────────────────────────────────────────
  heading('3. The quote is arithmetic, not a guess');

  const { quote } = await api<{ quote: Record<string, number | string> }>('/api/quote', {
    method: 'POST',
    body: JSON.stringify({ corridorId: 'NG.NGN.NIP.onramp', amount: AMOUNT }),
  });

  const fee = Number(quote.fee);
  const rate = Number(quote.rate);
  const receive = Number(quote.receiveUsdc);
  const expected = Math.round(((AMOUNT - fee) / rate) * 1e6) / 1e6;

  check('fee is disclosed', fee > 0, `${fee} NGN`);
  check(
    'USDC out matches (amount less fee) over rate',
    Math.abs(receive - expected) < 1e-6,
    `${receive} vs ${expected}`,
  );
  check('the rate carries a source', String(quote.rateSource).length > 0, String(quote.rateSource));

  // ── 4. Float ────────────────────────────────────────────────────────────
  heading('4. KORA can cover the other side');

  const treasury = process.env.NEXT_PUBLIC_SETTLEMENT_ADDRESS ?? '';
  check('a treasury address is configured', treasury.length === 56, treasury.slice(0, 12) + '…');

  const floatBefore = (await usdcBalance(treasury)) ?? 0;
  check('the float covers this payment', floatBefore >= receive, `${floatBefore} USDC available`);

  if (floatBefore < receive) {
    console.log(
      `\n\x1b[31mStopping before the spend.\x1b[0m The float holds ${floatBefore} USDC and this ` +
        `payment needs ${receive}. Top up from Circle's testnet faucet and run again.\n`,
    );
    process.exit(1);
  }

  // ── 5. Pre-state ────────────────────────────────────────────────────────
  heading('5. What is true before the send');

  const balanceBefore = await api<{ balance: number }>('/api/account/balance');
  const activityBefore = await api<{
    transactions: { id: string }[];
    spend: { daily: { buckets: { amount: number }[] } };
    realCount: number;
  }>('/api/account/activity');

  const todayBefore = activityBefore.spend.daily.buckets.at(-1)!.amount;

  note(`balance ${balanceBefore.balance.toLocaleString()} NGN`);
  note(`float ${floatBefore} USDC`);
  note(`today's outbound ${todayBefore.toLocaleString()} NGN, ${activityBefore.realCount} real rows`);

  // ── 6. Send ─────────────────────────────────────────────────────────────
  heading('6. The corridor runs');

  const sent = await api<{
    reference: string;
    recipient: { name: string; wallet: string };
    sent: { amount: number; currency: string };
    delivered: { amount: number; asset: string; hash: string; explorer: string };
    payout: {
      mode: string;
      payout: { amount: number; currency: string };
      anchor: { provider: string; rail: string };
      request: Record<string, unknown>;
      blocked: { reasons: string[]; probe: { status: number; code: string } | null };
    };
  }>('/api/payments', {
    method: 'POST',
    body: JSON.stringify({
      recipientName: RECIPIENT.name,
      country: RECIPIENT.country,
      countryName: RECIPIENT.countryName,
      payoutCurrency: 'BOB',
      account: 'Banco Union ****4471',
      amount: AMOUNT,
      note: 'end to end verification',
    }),
  });

  check('it returned a reference', sent.reference.startsWith('KORA-PAY'), sent.reference);
  check('the naira leg matches the request', sent.sent.amount === AMOUNT);
  check('the USDC leg matches the quote', sameToStroops(sent.delivered.amount, receive));
  check('a Stellar hash came back', /^[0-9a-f]{64}$/.test(sent.delivered.hash));
  note(sent.delivered.explorer);

  // ── 7. On chain ─────────────────────────────────────────────────────────
  heading('7. Stellar agrees, independently of us');

  const tx = await fetch(`${HORIZON}/transactions/${sent.delivered.hash}`, {
    cache: 'no-store',
  }).then((r) => (r.ok ? r.json() : null));

  check('the transaction is on the ledger', tx !== null);
  check('it succeeded', tx?.successful === true);
  check('it was sent by the treasury', tx?.source_account === treasury);
  note(`ledger ${tx?.ledger}, fee ${tx?.fee_charged} stroops`);

  const payments = await fetch(`${HORIZON}/transactions/${sent.delivered.hash}/payments`, {
    cache: 'no-store',
  }).then((r) => (r.ok ? r.json() : null));

  const op = payments?._embedded?.records?.[0];
  check('it carries one USDC payment', op?.asset_code === 'USDC', op?.asset_code);
  check(
    'for exactly the delivered amount',
    sameToStroops(Number(op?.amount ?? 0), sent.delivered.amount),
    `${op?.amount} USDC`,
  );
  check('to the beneficiary wallet', op?.to === sent.recipient.wallet);

  // ── 8. Balances moved both sides ────────────────────────────────────────
  heading('8. Both wallets moved by the same amount');

  const floatAfter = (await usdcBalance(treasury)) ?? 0;
  const walletAfter = (await usdcBalance(sent.recipient.wallet)) ?? 0;

  check(
    'the float fell by the delivered amount',
    sameToStroops(floatBefore - floatAfter, sent.delivered.amount),
    `${floatBefore} → ${floatAfter}`,
  );
  check('the beneficiary wallet holds at least it', walletAfter >= sent.delivered.amount, `${walletAfter} USDC`);

  // ── 9. The ledger ───────────────────────────────────────────────────────
  heading('9. The naira side is recorded');

  const balanceAfter = await api<{ balance: number }>('/api/account/balance');

  check(
    'the balance fell by exactly the amount sent',
    balanceBefore.balance - balanceAfter.balance === AMOUNT,
    `${balanceBefore.balance.toLocaleString()} → ${balanceAfter.balance.toLocaleString()}`,
  );

  // ── 10. It reaches the interface ────────────────────────────────────────
  heading('10. The dashboard shows it');

  const activityAfter = await api<{
    transactions: {
      id: string;
      party: string;
      amount: number;
      real: boolean;
      receipt?: {
        recipient: { country: string; countryName: string };
        origin: string;
        outcome: { hash: string | null; delivered: { amount: number; asset: string } | null };
      };
    }[];
    spend: { daily: { buckets: { amount: number }[] } };
    realCount: number;
  }>('/api/account/activity');

  const row = activityAfter.transactions.find((t) => t.id === sent.reference);

  check('the payment is a row', row !== undefined, sent.reference);
  check('it names the recipient', row?.party === RECIPIENT.name, row?.party);
  check('it is marked real, not opening history', row?.real === true);
  check('it is signed outward', row?.amount === -AMOUNT, String(row?.amount));
  check('one more real row than before', activityAfter.realCount === activityBefore.realCount + 1);

  /*
   * The receipt, which is what the detail panel reads.
   *
   * The row alone says a payment happened. The receipt is what lets somebody
   * open it afterwards and see where the money went and check the hash, which
   * is the whole argument for the panel existing. Asserted here because this
   * is the only test that makes a real payment, and a receipt that is never
   * written fails silently everywhere else: the row still renders, just plain.
   */
  const receipt = row?.receipt;

  check('the payment left a receipt', receipt !== undefined);
  check(
    'it records where the money was going',
    receipt?.recipient.country === RECIPIENT.country,
    `${receipt?.recipient.countryName} (${receipt?.recipient.country})`,
  );
  check(
    'it carries the same hash the send returned',
    receipt?.outcome.hash === sent.delivered.hash,
    receipt?.outcome.hash ?? 'none',
  );
  check(
    'and what was delivered',
    receipt?.outcome.delivered?.asset === sent.delivered.asset,
    `${receipt?.outcome.delivered?.amount} ${receipt?.outcome.delivered?.asset}`,
  );

  const todayAfter = activityAfter.spend.daily.buckets.at(-1)!.amount;
  check(
    "today's spend column rose by the amount",
    todayAfter - todayBefore === AMOUNT,
    `${todayBefore.toLocaleString()} → ${todayAfter.toLocaleString()}`,
  );

  // ── 11. The last mile, declared ─────────────────────────────────────────
  heading('11. The boliviano leg is priced and honestly labelled');

  const payout = sent.payout;

  check('it is marked simulated', payout.mode === 'simulated', payout.mode);
  check('a boliviano figure is quoted', payout.payout.amount > 0, `≈ ${payout.payout.amount} BOB`);
  check('the currency is BOB', payout.payout.currency === 'BOB');
  check('the anchor is named', payout.anchor.provider.length > 0, `${payout.anchor.provider} ${payout.anchor.rail}`);
  check('the request body is built', typeof payout.request.quoteId === 'string');
  check(
    'the quote id is not invented',
    String(payout.request.quoteId).startsWith('<'),
    String(payout.request.quoteId),
  );
  check('reasons are given', payout.blocked.reasons.length >= 2);
  check(
    'Pollar was actually asked',
    payout.blocked.probe !== null,
    payout.blocked.probe ? `${payout.blocked.probe.status} ${payout.blocked.probe.code}` : 'probe failed',
  );
  check(
    'and it refused, which is the expected answer',
    payout.blocked.probe?.status === 401,
    String(payout.blocked.probe?.code),
  );

  // Nothing anywhere should claim the bolivianos arrived.
  const serialised = JSON.stringify(payout);
  check('nothing claims completion', !/"status"\s*:\s*"completed"/.test(serialised));

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(
    `\n\x1b[1m${ran - failed}/${ran} checks passed${failed ? `, ${failed} failed` : ''}\x1b[0m`,
  );

  console.log(`
\x1b[1mArtefacts for the submission\x1b[0m
  reference   ${sent.reference}
  sent        ${AMOUNT.toLocaleString()} NGN off the KORA ledger
  delivered   ${sent.delivered.amount} ${sent.delivered.asset} on Stellar testnet
  tx          ${sent.delivered.hash}
  explorer    ${sent.delivered.explorer}
  from        ${treasury}  KORA treasury
  to          ${sent.recipient.wallet}  ${RECIPIENT.name}'s Pollar wallet
  float       ${floatBefore} → ${floatAfter} USDC
  last mile   ≈ ${payout.payout.amount} ${payout.payout.currency} via ${payout.anchor.provider} ${payout.anchor.rail}, SIMULATED
              ${payout.blocked.probe?.status} ${payout.blocked.probe?.code} from /ramps/quote on this run
`);

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n\x1b[31mThe run stopped:\x1b[0m ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
