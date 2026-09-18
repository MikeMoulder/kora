import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SendEntry } from './SendEntry';
import { Kora } from '@/components/Kora';

export const metadata: Metadata = {
  title: 'Send — KORA',
  description: 'Plan, fund and settle a cross-border payment through the KORA corridor.',
};

/**
 * `useSearchParams` forces client rendering up to the nearest Suspense
 * boundary, so the shipped Next docs ask for one here. The fallback is the
 * same flow with no prefilled sentence, which is a usable screen rather than
 * a spinner.
 */
export default function Page() {
  return (
    <Suspense fallback={<Kora />}>
      <SendEntry />
    </Suspense>
  );
}
