/**
 * Asks Pollar what Earn actually offers this app.
 *
 *   npm run probe:earn
 *
 * Idle Earn is the half of the agentic workflow that could most easily be
 * invented. `idea.md` says so in as many words: the exact behaviour depends on
 * Pollar's supported assets, strategies, lockups and withdrawal mechanics, and
 * none of it should be made up. So this runs before any of it is built, and
 * what it prints decides what gets built.
 *
 * `@pollar/core@0.11.3` declares four endpoints, read out of the shipped types
 * rather than out of documentation:
 *
 *   GET  /earn/providers                       ("blend" | "defindex")[]
 *   GET  /earn/opportunities?provider=         id, name, kind, asset, apy
 *   GET  /earn/position?provider=&opportunity= balance, apy, withdrawUnit
 *   POST /earn/build                           unsigned Soroban XDR
 *
 * The SDK's own note on the first one is the important one: a provider appears
 * only when it is configured, Blend needing a pool address and DeFindex an API
 * key, and an empty list means Earn is disabled and no Earn UI should be
 * drawn. An empty array is therefore a real answer rather than a failure, and
 * this script has to be able to tell the two apart.
 *
 * Both doors are tried, because they fail for different reasons and only one
 * of them is a statement about the product:
 *
 *   sdk.api.pollar.xyz     publishable key, origin checked. A 403
 *                          ORIGIN_NOT_ALLOWED here is about the Origin header,
 *                          not about Earn. See `ORIGIN` below.
 *   server.api.pollar.xyz  secret key, not origin checked. If Earn is absent
 *                          here it is absent.
 */

const SDK_BASE = process.env.POLLAR_SDK_API_URL ?? 'https://sdk.api.pollar.xyz/v1';

/**
 * The origin the SDK door is checked against.
 *
 * This is the finding that made the whole first run worthless. A script has no
 * origin, so `fetch` from Node sends no `Origin` header, and Pollar answers a
 * request with no origin exactly as it answers one from an origin that is not
 * on the list: 403 ORIGIN_NOT_ALLOWED. The first run read that as an empty
 * Domains list and it was nothing of the sort.
 *
 * Sent explicitly here, and the value has to match a Domains entry character
 * for character. `http://localhost:3000` passes. `https://localhost:3000` and
 * `http://127.0.0.1:3000` are both 403, which is worth knowing before somebody
 * spends an afternoon on the second one.
 */
const ORIGIN = process.env.POLLAR_PROBE_ORIGIN ?? 'http://localhost:3000';
const SERVER_BASE = process.env.POLLAR_SERVER_API_URL ?? 'https://server.api.pollar.xyz/v1';

const PUBLISHABLE = process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY ?? '';
const SECRET = process.env.POLLAR_SECRET_KEY ?? '';

interface Probe {
  door: 'sdk' | 'server';
  path: string;
  status: number;
  code: string;
  body: unknown;
}

async function get(door: 'sdk' | 'server', path: string): Promise<Probe> {
  const base = door === 'sdk' ? SDK_BASE : SERVER_BASE;
  const key = door === 'sdk' ? PUBLISHABLE : SECRET;

  try {
    const response = await fetch(`${base}${path}`, {
      // The server door is not origin checked, so the header is harmless
      // there and load bearing on the other one.
      headers: { 'x-pollar-api-key': key, Origin: ORIGIN },
      cache: 'no-store',
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = '<not JSON>';
    }

    const code =
      body && typeof body === 'object' && 'code' in body
        ? String((body as { code: unknown }).code)
        : '<no code>';

    return { door, path, status: response.status, code, body };
  } catch (err) {
    return {
      door,
      path,
      status: 0,
      code: 'NETWORK_UNREACHABLE',
      body: err instanceof Error ? err.message : err,
    };
  }
}

function report(probe: Probe) {
  const mark = probe.status === 200 ? 'ok  ' : 'fail';
  console.log(`[ ${mark} ] ${probe.door.padEnd(6)} ${probe.path.padEnd(42)} ${probe.status} ${probe.code}`);
  if (probe.status !== 200) return;
  console.log(`           ${JSON.stringify(probe.body)}`);
}

async function main() {
  console.log(`Origin      ${ORIGIN}`);
  console.log('');
  console.log('Keys');
  console.log(`  publishable  ${PUBLISHABLE ? PUBLISHABLE.slice(0, 12) + '...' : 'MISSING'}`);
  console.log(`  secret       ${SECRET ? SECRET.slice(0, 12) + '...' : 'MISSING'}`);
  console.log('');

  const providers: Probe[] = [];

  for (const door of ['sdk', 'server'] as const) {
    providers.push(await get(door, '/earn/providers'));
  }

  console.log('Providers');
  providers.forEach(report);
  console.log('');

  /*
   * Opportunities are asked for regardless of what providers said.
   *
   * If `/earn/providers` returns an empty list the correct product answer is
   * "no Earn UI", but the correct engineering answer is still to find out
   * whether the endpoint exists at all: a 422 "provider not configured" and a
   * 404 are very different findings, and only one of them means the feature is
   * unreachable rather than switched off.
   */
  console.log('Opportunities, asked for both providers whatever the list said');

  for (const door of ['sdk', 'server'] as const) {
    for (const provider of ['blend', 'defindex'] as const) {
      report(await get(door, `/earn/opportunities?provider=${provider}`));
    }
  }

  console.log('');
  console.log('How to read the answers:');
  console.log('  403 ORIGIN_NOT_ALLOWED    the Origin above is not a Domains entry');
  console.log('  401 SDK_AUTH_INVALID_TOKEN  origin fine, Earn wants a signed in user');
  console.log('  200 with providers: []    Earn is reachable and switched off');
  console.log('  404 on the server door    Earn is not on the server API at all');
}

main().catch((err) => {
  console.error('\nEarn probe failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
