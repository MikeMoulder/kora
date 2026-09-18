'use client';

import { PollarProvider } from '@pollar/react';
import '@pollar/react/styles.css';
import { POLLAR_PUBLISHABLE_KEY, STELLAR_NETWORK } from '@/lib/pollar/config';
import type { ReactNode } from 'react';

/**
 * Pollar is mounted even without a key.
 *
 * The African leg — parsing, corridors, quotes, funding — does not depend on
 * Pollar at all, and it should stay usable while the key is missing so the
 * missing piece is visibly the hand-off rather than the whole app. Components
 * that need a session check `isPollarConfigured()` and say what is missing.
 */
export function Providers({ children }: { children: ReactNode }) {
  if (!POLLAR_PUBLISHABLE_KEY) return <>{children}</>;

  return (
    <PollarProvider
      client={{
        apiKey: POLLAR_PUBLISHABLE_KEY,
        stellarNetwork: STELLAR_NETWORK,
        deviceLabel: 'KORA',
      }}
    >
      {children}
    </PollarProvider>
  );
}
