import { ACCOUNT } from '@/lib/demo-data';
import { makeReference } from '@/lib/corridor/adapters/shared';
import {
  createBankTransferCharge,
  isFlutterwaveConfigured,
  isTestMode,
} from '@/lib/flutterwave/client';
import { fail, ok, readJson } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Open a deposit.
 *
 * A permanent account number is the right thing to hand somebody who wants to
 * pay you, and it is exactly the wrong thing to test with: nothing in
 * Flutterwave's sandbox ever sends money into a static account, so it sits
 * there and no webhook ever fires. There is no faucet.
 *
 * A bank transfer charge is different. It names an amount, and Flutterwave's
 * test mode pays it itself a few seconds later, which produces a real
 * settlement against a real reference. So a deposit here opens a charge rather
 * than pointing at the permanent account, and the balance moves because money
 * genuinely arrived rather than because a number was incremented.
 *
 * In production both paths end in the same place: a `charge.completed` for a
 * reference, verified with Flutterwave, credited once to the ledger.
 */

const MIN = 100;
const MAX = 5_000_000;

export async function POST(request: Request) {
  try {
    const { amount } = await readJson<{ amount?: number }>(request);

    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new Error('An amount is required.');
    }

    if (amount < MIN || amount > MAX) {
      throw new Error(
        `Deposits are between ${MIN.toLocaleString()} and ${MAX.toLocaleString()} ${ACCOUNT.currency}.`,
      );
    }

    if (!isFlutterwaveConfigured()) {
      throw new Error(
        'No Flutterwave key on the server, so there is no account to pay into. Nothing was opened.',
      );
    }

    const reference = makeReference('KORA-DEP');

    const charge = await createBankTransferCharge({
      txRef: reference,
      amount,
      email: `${reference.toLowerCase()}@kora.test`,
      narration: `KORA deposit ${reference}`,
    });

    if (!charge.ok) {
      throw new Error(`Flutterwave could not open the deposit: ${charge.message}`);
    }

    return ok({
      reference,
      amount,
      currency: ACCOUNT.currency,
      accountNumber: charge.data.accountNumber,
      bankName: charge.data.bankName,
      // Flutterwave adds its fee on top, so this is what the payer actually
      // sends. Showing our figure would produce a transfer that never matches.
      transferAmount: charge.data.transferAmount,
      mode: isTestMode() ? 'test' : 'live',
      /**
       * Test mode pays its own bank transfers within seconds. Saying so lets
       * the interface tell someone to wait rather than to go and pay.
       */
      selfSettling: isTestMode(),
    });
  } catch (err) {
    return fail(err);
  }
}
