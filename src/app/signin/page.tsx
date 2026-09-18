import type { Metadata } from 'next';
import { SignInPage } from '@/components/ui/sign-in-page';

export const metadata: Metadata = {
  title: 'Sign in — KORA',
  description: 'Sign in to KORA, the African corridor for Pollar.',
};

export default function Page() {
  return <SignInPage />;
}
