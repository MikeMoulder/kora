# KORA Handoff

Living progress tracker. Updated at the end of every task.

**Last updated:** 2026-09-18
**Deadline:** 2026-09-18 13:00 UTC
**Current phase:** G, Next.js 16 compliance audit
**Commits:** 45 of 50+ target

---

## Next task

**Phase G. Next.js 16 compliance audit.**

AGENTS.md asks for the docs in `node_modules/next/dist/docs/` to be read before writing
code, because this version has breaking changes. That was not done. The build and the
typecheck are both clean, so nothing is obviously wrong, but clean is not the same as
correct.

Read the App Router docs, then check route handler signatures, the generated layout and
page prop types, caching defaults on the funding routes, and anything marked deprecated.
Fix whatever the audit finds.

Doing this before Phase H means any corrections land before more code is written on top.

---

## Blocked, waiting on the user

These are dashboard settings at dashboard.pollar.xyz. Nothing in the code can work around
them.

| Setting | Where | Why it matters |
| --- | --- | --- |
| Add `http://localhost:3000` | Build then Domains | Every SDK call returns 403 `ORIGIN_NOT_ALLOWED` until this is set |
| Fund the reserve wallet | Treasury then Account Funding | New wallets cannot meet the Stellar base reserve |
| Turn on sponsorship | Treasury then Sponsorship | Without it the user pays their own network fee |
| Add USDC | Treasury then Tokens and Trustlines | Without it the transfer fails with `op_no_trust` |

Optional: `GEMINI_API_KEY` in `.env.local`, from aistudio.google.com/apikey. The app works
without it and says which parser ran.

A background watcher is running that will report the moment the localhost origin is
allowed.

---

## Test log

| Date | Suite | Command | Count | Result |
| --- | --- | --- | --- | --- |
| 2026-09-18 | Corridor and intent smoke | `npm run smoke` | 20 checks | All passed |
| 2026-09-18 | Corridor and intent smoke, extended | `npm run smoke` | 32 checks | 1 failed, themed SVG assertion |
| 2026-09-18 | Corridor and intent smoke, after fix | `npm run smoke` | 34 checks | All passed |
| 2026-09-18 | TypeScript | `npx tsc --noEmit` | Whole project | Clean, run 6 times during the build |
| 2026-09-18 | Production build | `npm run build` | 11 routes | Clean, run twice |
| 2026-09-18 | Layout, 375px | Browser measurement | Overflow and clipping | None |
| 2026-09-18 | Layout, 1024px | Browser measurement | Overflow and clipping | None |
| 2026-09-18 | Layout, 1440px | Browser measurement | Overflow and clipping | None |
| 2026-09-18 | Layout, 800px | Browser measurement | Clipping | 1 found, fixed by moving the rail breakpoint to `lg` |
| 2026-09-18 | Pollar key, live API | `curl` against `sdk.api.pollar.xyz` | 1 | Key valid, origin rejected |
| 2026-09-18 | Manual browser walkthrough | Compose to hand-off | 1 full run | African leg passed, hand-off blocked |
| 2026-09-18 | Secret audit across all history | `git grep` over every commit | 2 secrets, 44 commits | Neither key present in history |
| 2026-09-18 | Typecheck after backfill | `npx tsc --noEmit` | Whole project | Clean |
| 2026-09-18 | Smoke after backfill | `npm run smoke` | 34 checks | All passed |
| 2026-09-18 | Production build after backfill | `npm run build` | 11 routes | Clean |

**Total automated checks passing: 34.**

### What the tests caught

- The shape parity test caught a real bug. A code comment claimed the QR SVG used
  `currentColor` so it would follow the page theme. It did not, because the QR library
  paints with `stroke` and the replacement only looked for `fill`. The claim was false
  until the test forced it true.
- The 800px layout measurement caught the country name clipping inside the route rail.

---

## Done so far

### Phase A, recon

Read the SDK from npm rather than trusting the docs site, which is stale and still
advertises version 0.4.3 while npm ships 0.11.3. Found the corridor model that the whole
product thesis rests on. Confirmed Pollar has no African corridors and that x402 is not in
the shipped SDK.

Written up in `RECON.md`.

### Phase B, corridor core

Ten modules. Corridor types mirrored from Pollar's own ramp schema, two working sandbox
adapters, five planned corridors that throw rather than pretend, a registry, an engine, a
live FX module and a swappable store.

### Phase C, intent layer

A deterministic parser that handles all three demo sentences with no API key, a Gemini
layer that is written but has never run, and a resolver that checks everything the model
produces against the registry.

### Phase D, API routes

Eight routes covering intent, corridors, quotes, the funding lifecycle, the cold start
rehydrate path and the operator queue.

### Phase E, interface

Landing page and composer, plan screen with the fee breakdown, funding screen rendering
Pollar shaped instructions, hand-off screen, payment passport, corridor registry page and
operator console. Colour encodes which side owns which leg.

### Phase F, commit history

Split the finished work into 44 commits, one per module or screen, each with a subject line
and a body explaining the reasoning. Working tree is clean and the committed tree was
re-verified: typecheck clean, 34 smoke checks passing, production build clean across 11
routes.

Audited every commit in the history for the publishable key and the settlement secret.
Neither appears. `.env.local` is untracked, `.next` is ignored, and the only key strings in
source are placeholders.

Also fixed gitignore, which had `.env*` and was silently ignoring the environment template
along with the real env files.

### Other

A real Stellar testnet settlement account, created and funded by a script in the repo,
with a USDC trustline open:
`GAEHDX7IXJHG2UUCCUES63C7WBLPXJX6IHTA6TGENHDJBSZ65AB7FWQE`

---

## Known gaps, stated plainly

1. **The Pollar hand-off has never run.** Everything else is finished and tested. This one
   step is the proof the project needs, and it is blocked on dashboard settings.
2. **Gemini has never been called.** The model name `gemini-2.5-flash` is an assumption
   until a real request proves it.
3. **Next.js 16 docs were not read before writing code**, which AGENTS.md asks for. The
   build and typecheck are clean, but that is not the same as being correct. Phase G covers
   the audit.
4. **Nothing is deployed.** Judges will want a link. Nothing is pushed to a remote either,
   so the history exists only on this machine.
5. **Existing project docs contain em-dashes.** The preference was noted after they were
   written. Phase K6 covers the cleanup.
