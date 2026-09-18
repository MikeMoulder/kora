import { NextResponse } from 'next/server';
import { POLLAR_PUBLISHABLE_KEY, STELLAR_NETWORK } from '@/lib/pollar/config';
import { hasServerKey, registerUserWithWallet, verifyToken } from '@/lib/pollar/server';
import { fail, ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Live Pollar readiness.
 *
 * Every blocker on the Pollar side is a dashboard setting, and the way you
 * normally discover which one is a 403 in a console nobody opens. This route
 * asks Pollar directly and answers in the same language the corridor registry
 * uses for its own gaps: what is blocked, and the exact thing that unblocks it.
 *
 * It is deliberately cheap. The two default probes create nothing: one
 * verifies a token that was never valid, the other reads the app config. The
 * probe that does leave a record is behind `?deep=1` and says so.
 */

type State = 'pass' | 'blocked' | 'missing' | 'unknown';

interface Check {
  id: string;
  label: string;
  state: State;
  detail: string;
  /** Where the person goes to fix it. Empty when there is nothing to fix. */
  fix: string;
}

const SDK_CONFIG_URL = 'https://sdk.api.pollar.xyz/v2/applications/config';

/**
 * The origin the browser SDK will actually send.
 *
 * Checking the allowlist against a guess would be worse than not checking, so
 * this is taken from the request that reached us rather than from a constant.
 */
function callerOrigin(request: Request): string {
  const origin = request.headers.get('origin');
  if (origin) return origin;

  const host = request.headers.get('host') ?? 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

async function checkDomains(origin: string): Promise<Check> {
  const base: Omit<Check, 'state' | 'detail' | 'fix'> = {
    id: 'domains',
    label: 'Allowed origins',
  };

  if (!POLLAR_PUBLISHABLE_KEY.startsWith('pub_')) {
    return {
      ...base,
      state: 'missing',
      detail: 'No publishable key, so the browser SDK cannot start at all.',
      fix: 'dashboard.pollar.xyz, Build then API Keys, generate a publishable testnet key.',
    };
  }

  let response: Response;

  try {
    response = await fetch(SDK_CONFIG_URL, {
      headers: { 'x-pollar-api-key': POLLAR_PUBLISHABLE_KEY, origin },
      cache: 'no-store',
    });
  } catch {
    return {
      ...base,
      state: 'unknown',
      detail: 'Could not reach the SDK API to check.',
      fix: '',
    };
  }

  if (response.ok) {
    return {
      ...base,
      state: 'pass',
      detail: `${origin} is on the allowed list. The browser SDK can sign in.`,
      fix: '',
    };
  }

  const body = (await response.json().catch(() => null)) as { code?: string } | null;

  if (body?.code === 'ORIGIN_NOT_ALLOWED') {
    return {
      ...base,
      state: 'blocked',
      detail: `Pollar rejects ${origin}, so every browser SDK call fails including the first config fetch.`,
      fix: `dashboard.pollar.xyz, Build then Domains, add ${origin} exactly. It takes effect immediately.`,
    };
  }

  return {
    ...base,
    state: 'blocked',
    detail: `The SDK API answered ${response.status} ${body?.code ?? 'with no code'}.`,
    fix: 'Check the publishable key under Build then API Keys.',
  };
}

async function checkServerApi(): Promise<Check> {
  const base: Omit<Check, 'state' | 'detail' | 'fix'> = {
    id: 'server-api',
    label: 'Server API',
  };

  if (!hasServerKey()) {
    return {
      ...base,
      state: 'missing',
      detail: 'No secret key on the server, so the backend cannot talk to Pollar.',
      fix: 'Put the sec_testnet key in .env.local as POLLAR_SECRET_KEY. Never prefix it NEXT_PUBLIC_.',
    };
  }

  // A token that was never valid. The key still has to authenticate before
  // Pollar can judge the token, so this proves the key without writing.
  const probe = await verifyToken('kora-readiness-probe');

  if (!probe.ok && probe.code === 'SDK_AUTH_INVALID_TOKEN') {
    return {
      ...base,
      state: 'pass',
      detail: 'Secret key accepted. The backend can reach Pollar with no dashboard changes.',
      fix: '',
    };
  }

  if (!probe.ok && (probe.code === 'INVALID_CREDENTIALS' || probe.code === 'API_KEY_NOT_FOUND')) {
    return {
      ...base,
      state: 'missing',
      detail: 'Pollar rejected the secret key.',
      fix: 'dashboard.pollar.xyz, Build then API Keys, generate a secret testnet key.',
    };
  }

  return {
    ...base,
    state: 'unknown',
    detail: `Unexpected answer from the probe: ${probe.ok ? probe.code : probe.code}.`,
    fix: '',
  };
}

/**
 * Wallet provisioning, which is the one probe with a side effect: it registers
 * a throwaway user. Opt in with `?deep=1` so a status page can be polled
 * without filling the dashboard with probes.
 */
async function checkWalletProvisioning(): Promise<Check> {
  const base: Omit<Check, 'state' | 'detail' | 'fix'> = {
    id: 'wallet-provisioning',
    label: 'Wallet provisioning',
  };

  const result = await registerUserWithWallet({
    externalId: `kora-readiness-${Date.now()}`,
  });

  if (result.ok) {
    return {
      ...base,
      state: 'pass',
      detail: `Pollar provisioned ${result.content.walletAddress}, funded ${result.content.funded}. The reserve wallet is paying the sponsored reserve.`,
      fix: '',
    };
  }

  if (result.code === 'WALLET_CREATION_FAILED' || result.code === 'FUND_XLM_FAILED') {
    return {
      ...base,
      state: 'blocked',
      detail:
        'Pollar could not create the wallet. Provisioning is a sponsored createAccount, so it fails when the funding wallet holds no XLM.',
      fix: 'dashboard.pollar.xyz, Treasury then Account Funding, fund the reserve wallet. Then Treasury then Sponsorship, turn it on.',
    };
  }

  if (result.code === 'NO_DEFAULT_TRUSTLINES') {
    return {
      ...base,
      state: 'blocked',
      detail: 'No default assets are configured, so a new wallet cannot hold USDC.',
      fix: 'dashboard.pollar.xyz, Treasury then Tokens and Trustlines, add USDC.',
    };
  }

  return {
    ...base,
    state: 'blocked',
    detail: `Pollar answered ${result.code}.`,
    fix: 'See the Pollar error codes reference.',
  };
}

export async function GET(request: Request) {
  try {
    const deep = new URL(request.url).searchParams.get('deep') === '1';
    const origin = callerOrigin(request);

    const [serverApi, domains] = await Promise.all([checkServerApi(), checkDomains(origin)]);

    const checks: Check[] = [serverApi, domains];

    if (deep) checks.push(await checkWalletProvisioning());

    return ok({
      network: STELLAR_NETWORK,
      origin,
      deep,
      checks,
      /**
       * The headline. The two doors into Pollar fail independently, and
       * saying so is the whole point: the backend can be working while the
       * browser is locked out, which is exactly the state an unconfigured
       * Domains list produces.
       */
      summary: {
        backend: serverApi.state,
        browser: domains.state,
      },
    });
  } catch (err) {
    return fail(err, 502);
  }
}

export const OPTIONS = () => new NextResponse(null, { status: 204 });
