'use client';

import { useSearchParams } from 'next/navigation';
import { Kora } from '@/components/Kora';

/**
 * Reads the sentence the dashboard handed over.
 *
 * Both the manual keypad and Kora Agent navigate here with an `intent` query
 * parameter rather than carrying state across the route. A URL survives a
 * refresh, can be shared into a bug report, and keeps the payment flow with
 * exactly one entry point.
 */
export function SendEntry() {
  const params = useSearchParams();
  const intent = params.get('intent')?.trim() || undefined;

  return <Kora initialIntent={intent} />;
}
