import type { Metadata } from 'next';
import { SignInPage } from '@/components/ui/sign-in-page';

/**
 * The front door.
 *
 * Sign in is the root route rather than a side street off the dashboard,
 * because it is the first thing anybody arriving at KORA should see. The
 * dashboard moved to /dashboard and is reached through here. `src/proxy.ts`
 * enforces that in both directions.
 */
export const metadata: Metadata = {
  title: 'Sign in | KORA',
  description: 'Sign in to KORA, the African corridor for Pollar.',
};

export default function Page() {
  return <SignInPage />;
}
