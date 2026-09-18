import type { Metadata } from 'next';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { DemoSessionGuard } from '@/components/DemoSessionGuard';

/**
 * The account.
 *
 * Reached through sign in at / and nowhere else. `src/proxy.ts` turns away any
 * request for this route without a session cookie; the guard around it covers
 * the one arrival the server never sees, which is Back onto a history entry
 * that already exists.
 */
export const metadata: Metadata = {
  title: 'Dashboard | KORA',
  description: 'Balance, rates, activity and the corridor engine behind them.',
};

export default function Page() {
  return (
    <DemoSessionGuard>
      <Dashboard />
    </DemoSessionGuard>
  );
}
