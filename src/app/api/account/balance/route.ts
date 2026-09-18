import { ACCOUNT } from '@/lib/demo-data';
import { accountBalance } from '@/lib/account/ledger';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The account balance.
 *
 * Opening figure plus movements, both returned separately so the interface can
 * be honest about which part is sample data and which part actually happened.
 */
export async function GET() {
  try {
    return ok(await accountBalance(ACCOUNT.balance, ACCOUNT.currency));
  } catch (err) {
    return fail(err, 500);
  }
}
