'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getDemoSession } from '@/lib/demo-auth';

/**
 * The second half of the gate.
 *
 * `src/proxy.ts` covers every request that reaches the server, which is every
 * way of arriving at the dashboard except one: a history entry that already
 * exists. Signing out and pressing Back re-displays the account from the
 * client router's cache, and the browser's own back forward cache does the
 * same thing a layer lower. Neither asks the server anything, so neither meets
 * the proxy, and the dashboard was found on screen after sign out with no
 * cookie left in the jar.
 *
 * This is a check, not a second gate. The proxy is what keeps the account off
 * the screen of somebody who never signed in. This is what takes it back off
 * the screen of somebody who signed out and then reached for Back.
 *
 * Both events are needed and they fire in different cases. Mounting covers a
 * client side navigation, where React builds the page again. `pageshow` covers
 * a restore from the back forward cache, where the whole document is revived
 * with its effects already run and nothing remounts at all.
 */
export function DemoSessionGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    const check = () => {
      if (getDemoSession()) return;
      setSignedOut(true);
      router.replace('/');
    };

    check();
    window.addEventListener('pageshow', check);
    return () => window.removeEventListener('pageshow', check);
  }, [router]);

  /*
   * Optimistic on purpose. Anybody who got here through the proxy has a
   * session, so holding the page back until an effect confirms it would put a
   * blank frame in front of every honest load to catch a case that only
   * happens on the way out. Render, then withdraw if the check fails.
   */
  return signedOut ? null : <>{children}</>;
}
