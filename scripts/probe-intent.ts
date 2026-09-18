/**
 * Checks on the intent parser.
 *
 * Two things are under test and they are different things:
 *
 *   the merge policy   which parser's answer survives when both have one
 *   the fallback       what the rules read when the model is not there
 *
 * Neither needs an API key, a network or a treasury. `mergeIntents` is pure and
 * `parseWithRules` is string matching, so this runs anywhere in milliseconds,
 * which is the point: the readings it pins down are ones that were wrong in
 * production for a while without anything failing.
 *
 *   npm run probe:intent
 */

import { parseWithRules } from '../src/lib/intent/rules';
import { mergeIntents } from '../src/lib/intent/gemini';
import { EMPTY_INTENT, type PaymentIntent } from '../src/lib/intent/types';

let ran = 0;
let failed = 0;

function check(what: string, got: unknown, want: unknown) {
  ran += 1;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'pass' : 'FAIL'}  ${what}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

function intent(over: Partial<PaymentIntent> = {}): PaymentIntent {
  return { ...EMPTY_INTENT, ...over };
}

// ── The merge policy ──────────────────────────────────────────────────────

console.log('\nthe model decides');

/*
 * The reading that made this change necessary. The rules found a line item
 * number, the model found the amount, and the old policy preferred the rules
 * because they were "safer with money".
 */
const disagreement = mergeIntents(
  intent({ amount: 3, currency: 'NGN', recipientName: 'Carlos' }),
  intent({ amount: 250_000, currency: 'NGN', recipientName: 'Carlos', destinationCountry: 'BO' }),
);

check('the model wins on the amount', disagreement.amount, 250_000);
check('and brings what the rules missed', disagreement.destinationCountry, 'BO');

check(
  'a currency the model did not name is filled from the rules',
  mergeIntents(intent({ currency: 'NGN' }), intent({ amount: 5000 })).currency,
  'NGN',
);

check(
  'the model overrules a currency the rules did name',
  mergeIntents(intent({ currency: 'NGN' }), intent({ amount: 80, currency: 'USD' })).currency,
  'USD',
);

/*
 * The one field with no fallback. A null amount from the model means the
 * sentence named none, and the rules are exactly the thing that would turn
 * "invoice 3" into three naira if allowed to fill that gap.
 */
check(
  'a null amount from the model stays null',
  mergeIntents(intent({ amount: 3 }), intent({ recipientName: 'Carlos' })).amount,
  null,
);

check(
  'the rules still fill a name, a country and a purpose',
  (() => {
    const m = mergeIntents(
      intent({ recipientName: 'Carlos', destinationCountry: 'BO', purpose: 'brand system' }),
      intent({ amount: 2000 }),
    );
    return [m.recipientName, m.destinationCountry, m.purpose];
  })(),
  ['Carlos', 'BO', 'brand system'],
);

// ── The fallback ──────────────────────────────────────────────────────────

console.log('\nthe rules, when the model is not there');

const cases: { text: string; amount: number | null; currency: string | null }[] = [
  // The two readings that were wrong in production.
  { text: 'pay Carlos for invoice 3 tomorrow, 250k naira', amount: 250_000, currency: 'NGN' },
  {
    text: 'I need to get 40 thousand naira over to Diego Rojas in Bolivia for the launch film',
    amount: 40_000,
    currency: 'NGN',
  },

  // And the ones that were always right, which have to stay that way.
  { text: 'Send ₦100,000 to Carlos in Bolivia for his logo design.', amount: 100_000, currency: 'NGN' },
  { text: "I owe Maria 80 bucks for the logo. She's in Bolivia.", amount: 80, currency: 'USD' },
  { text: 'Pay Diego KES 5,000 in Bolivia for september invoice', amount: 5_000, currency: 'KES' },
  { text: 'Send ₦2,000 to Carlos Mamani in Bolivia for the brand system', amount: 2_000, currency: 'NGN' },

  // A scale word with no currency still reads as money, ahead of any bare number.
  { text: 'send 250k to Carlos in Bolivia', amount: 250_000, currency: null },
  { text: 'pay Maria 1.5 million naira for the rebrand', amount: 1_500_000, currency: 'NGN' },

  // A currency named away from its number, which the word scan picks up.
  { text: 'pay 80 to Carlos in naira', amount: 80, currency: 'NGN' },
];

for (const c of cases) {
  const { intent: got } = parseWithRules(c.text);
  check(`"${c.text.slice(0, 52)}"`, [got.amount, got.currency], [c.amount, c.currency]);
}

console.log('\nwhat the rules refuse to read');

check(
  'a year is not an amount',
  parseWithRules('settle the 2024 invoice for Carlos in Bolivia').intent.amount,
  null,
);

// ── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${ran - failed}/${ran} checks passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
