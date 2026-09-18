/**
 * End-to-end smoke test for the corridor + intent layers.
 *
 * Runs the whole African leg with no browser and no Pollar key:
 * parse a sentence → resolve a corridor → quote → funding request →
 * report payment → settle. Plus the negative cases that prove the
 * capability matrix is enforced rather than decorative.
 *
 *   npm run smoke
 */

import { parseWithRules } from '../src/lib/intent/rules';
import { parseIntent } from '../src/lib/intent/gemini';
import { resolveIntent } from '../src/lib/intent/resolve';
import {
  confirmFunding,
  createFunding,
  fundingStatus,
  quote,
  reportPayment,
} from '../src/lib/corridor/engine';
import {
  corridors,
  coverageSummary,
  isExecutable,
  koraRails,
  POLLAR_RAILS,
} from '../src/lib/corridor/registry';
import { CorridorNotExecutable } from '../src/lib/corridor/adapters/planned';
import { usdcToBob } from '../src/lib/corridor/rates';

let failures = 0;

function check(label: string, condition: boolean, detail?: string) {
  const mark = condition ? '  ok  ' : ' FAIL ';
  if (!condition) failures++;
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ''}`);
}

function heading(text: string) {
  console.log(`\n\x1b[1m${text}\x1b[0m`);
}

async function main() {
  heading('Registry');
  const cov = coverageSummary();
  console.log(
    `  KORA: ${cov.koraCorridors} corridors / ${cov.koraCountries} countries ` +
      `(${cov.koraExecutable} executable)`,
  );
  console.log(`  Pollar: ${cov.pollarCorridors} corridors / ${cov.pollarCountries} countries`);
  console.log(`  Pollar rails: ${POLLAR_RAILS.join(', ')}`);
  console.log(`  KORA adds:    ${koraRails().join(', ')}`);
  check('Pollar has zero African corridors', cov.pollarAfricanCorridors === 0);
  check('KORA declares at least one executable corridor', cov.koraExecutable >= 1);
  check(
    'every non-live corridor explains itself',
    corridors.filter((c) => c.readiness !== 'live').every((c) => Boolean(c.readinessNote)),
  );

  heading('Intent parsing (the fallback, on its own)');
  const cases: { text: string; expect: Partial<ReturnType<typeof parseWithRules>['intent']> }[] = [
    {
      text: 'Send ₦100,000 to Carlos in Bolivia for his logo design.',
      expect: { amount: 100000, currency: 'NGN', destinationCountry: 'BO', recipientName: 'Carlos' },
    },
    {
      text: "I owe Maria 80 bucks for the logo. She's in Bolivia. Pay her tomorrow.",
      expect: { amount: 80, currency: 'USD', destinationCountry: 'BO', timing: 'scheduled' },
    },
    {
      text: 'Pay Diego KES 5,000 in Bolivia for september invoice',
      expect: { amount: 5000, currency: 'KES', destinationCountry: 'BO' },
    },
  ];

  for (const c of cases) {
    const { intent } = parseWithRules(c.text);
    const wrong = Object.entries(c.expect).filter(
      ([k, v]) => intent[k as keyof typeof intent] !== v,
    );
    check(
      `"${c.text.slice(0, 46)}…"`,
      wrong.length === 0,
      wrong.length
        ? wrong.map(([k, v]) => `${k}: want ${v}, got ${intent[k as keyof typeof intent]}`).join('; ')
        : `${intent.amount} ${intent.currency} → ${intent.destinationCountry}`,
    );
  }

  /*
   * The whole path, whichever parser ends up answering.
   *
   * This run usually has no Gemini key, because smoke is not given an env
   * file, so what it normally proves is that the fallback still produces a
   * usable intent and says out loud that it was the one that read the
   * sentence. The merge policy itself is pinned in `probe:intent`, which needs
   * no key either and can therefore test both sides of it.
   */
  heading('Intent parsing (the whole path)');
  const live = await parseIntent('Send ₦100,000 to Carlos in Bolivia for his logo design.');
  console.log(`  source: ${live.source}${live.note ? ` · ${live.note}` : ''}`);
  check('a sentence both parsers can read comes out the same either way', live.intent.amount === 100000);
  check('and in the currency it was written in', live.intent.currency === 'NGN');
  check('it names which parser answered', live.source === 'gemini' || live.source === 'rules');

  heading('Resolution');
  const resolution = resolveIntent(live.intent);
  console.log(`  ${resolution.status}: ${resolution.message}`);
  check('resolves to a ready corridor', resolution.status === 'ready');
  check('selected corridor is executable', Boolean(resolution.selected && isExecutable(resolution.selected)));
  check('destination is settled by Pollar', resolution.destination?.settledBy === 'pollar');

  heading('Quote');
  const corridorId = resolution.selected!.id;
  const q = await quote(corridorId, 100000);
  console.log(`  ${q.amount.toLocaleString()} ${q.currency} → ${q.receiveUsdc} USDC`);
  console.log(`  rate 1 USDC = ${q.rate.toFixed(4)} ${q.currency} · ${q.rateSource}`);
  console.log(`  fee ${q.fee.toLocaleString()} ${q.feeCurrency}`);
  check('quote produces positive USDC', q.receiveUsdc > 0);
  check('fee is non-zero and disclosed', q.fee > 0 && q.breakdown.length >= 4);
  check(
    'breakdown reconciles to the USDC figure',
    Math.abs((q.amount - q.fee) / q.rate - q.receiveUsdc) < 0.01,
    `${((q.amount - q.fee) / q.rate).toFixed(7)} vs ${q.receiveUsdc}`,
  );

  const { bob } = await usdcToBob(q.receiveUsdc);
  console.log(`  Bolivia leg (Pollar): ${q.receiveUsdc} USDC → Bs ${bob.toLocaleString()}`);

  heading('Funding lifecycle');
  const request = await createFunding(corridorId, q);
  console.log(`  reference ${request.reference} · ${request.instructions.fields.length} fields`);
  check('instructions carry a reference field', request.instructions.fields.some((f) => f.key === 'reference'));
  check('instructions carry bank details', request.instructions.fields.some((f) => f.key === 'bank_account'));
  check('starts awaiting payment', request.status === 'awaiting_payment');

  const reported = await reportPayment(request.reference);
  check('reporting does not fund', reported.status === 'payment_reported');

  const confirmed = await confirmFunding(request.reference);
  check('operator confirmation funds it', confirmed.status === 'funded');
  check('funded amount matches the quote', confirmed.fundedAmountUsdc === q.receiveUsdc);

  const final = await fundingStatus(request.reference);
  console.log(`  timeline: ${final.events.map((e) => e.status).join(' → ')}`);

  heading('Kenya · M-Pesa corridor');
  const mpesa = corridors.find((c) => c.id === 'KE.KES.MPESA.onramp')!;
  const mq = await quote(mpesa.id, 5_000);
  console.log(`  ${mq.amount.toLocaleString()} ${mq.currency} → ${mq.receiveUsdc} USDC`);
  const mreq = await createFunding(mpesa.id, mq);
  check('M-Pesa quote requires a phone number', mq.requiredFields.some((f) => f.key === 'msisdn'));
  check('M-Pesa emits a scannable', Boolean(mreq.instructions.scannable));
  check(
    'scannable is an inline-safe themed SVG',
    mreq.instructions.scannable?.image.mediaType === 'image/svg+xml' &&
      mreq.instructions.scannable.image.inlineSafe === true &&
      mreq.instructions.scannable.image.data.includes('currentColor'),
  );
  check(
    'USSD payload carries the paybill and reference',
    Boolean(
      mreq.instructions.scannable?.payload?.includes('400200') &&
        mreq.instructions.scannable.payload.includes(mreq.reference),
    ),
    mreq.instructions.scannable?.payload ?? undefined,
  );
  check('M-Pesa confirms itself — no operator step', mreq.requiresOperatorConfirmation === false);

  heading('Shape parity across adapters');
  // The claim this project rests on: one renderer serves every rail because
  // every adapter emits Pollar's own instruction shape. Assert it rather than
  // assert it in prose.
  const FIELD_KEYS = new Set([
    'amount', 'currency', 'rail', 'reference', 'expires_at', 'status_page',
    'account_holder', 'bank_name', 'bank_address', 'bank_account', 'bank_routing',
    'iban', 'bic', 'clabe', 'deposit_address', 'memo',
  ]);
  const FIELD_TYPES = new Set(['text', 'code', 'amount', 'datetime', 'url']);

  for (const [name, req] of [['Nigeria NIP', request], ['Kenya M-Pesa', mreq]] as const) {
    const fields = req.instructions.fields;
    check(
      `${name} fields use only Pollar's key enum`,
      fields.every((f) => FIELD_KEYS.has(f.key)),
      fields.filter((f) => !FIELD_KEYS.has(f.key)).map((f) => f.key).join(', ') || undefined,
    );
    check(
      `${name} fields use only Pollar's type enum`,
      fields.every((f) => FIELD_TYPES.has(f.type)),
    );
    check(
      `${name} every field is labelled and non-empty`,
      fields.every((f) => f.label.trim().length > 0 && f.value.trim().length > 0),
    );
  }

  const nipShape = new Set(request.instructions.fields.map((f) => f.type));
  const mpesaShape = new Set(mreq.instructions.fields.map((f) => f.type));
  check(
    'both adapters render from the same field vocabulary',
    [...nipShape].every((t) => FIELD_TYPES.has(t)) && [...mpesaShape].every((t) => FIELD_TYPES.has(t)),
    `NIP: ${[...nipShape].join('/')} · M-Pesa: ${[...mpesaShape].join('/')}`,
  );

  heading('Capability matrix is enforced');
  const planned = corridors.find((c) => c.readiness === 'planned')!;
  let threw = false;
  try {
    await quote(planned.id, 10_000);
  } catch (err) {
    threw = err instanceof CorridorNotExecutable;
  }
  check(`quoting ${planned.id} throws CorridorNotExecutable`, threw);

  let rangeThrew = false;
  try {
    await quote(corridorId, 1);
  } catch {
    rangeThrew = true;
  }
  check('below-minimum amount is rejected', rangeThrew);

  heading(failures === 0 ? '\x1b[32mAll checks passed\x1b[0m' : `\x1b[31m${failures} check(s) failed\x1b[0m`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nSmoke run crashed:', err);
  process.exit(1);
});
