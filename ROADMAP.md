# KORA Roadmap

Full plan for the project, start to finish. Every phase lists what it contains, what state
it is in, and what it depends on.

Status keys:

- `DONE` built and checked
- `PARTIAL` started, not finished
- `TODO` not started
- `BLOCKED` cannot start until something outside the code is fixed

Last updated: 2026-09-18

---

## Where the project stands right now

| Thing | State |
| --- | --- |
| African corridor engine | DONE, 34 automated checks passing |
| Intent parsing | DONE for rules, Gemini written but never run live |
| Web app and screens | DONE |
| Operator console | DONE |
| Pollar hand-off | Written, BLOCKED, never executed once |
| Commits | 45 of a target 50+ |
| Deployed | No |
| Submitted | No |

The honest summary: the half of the product we own is finished and tested. The half that
proves it connects to Pollar has never run. That is the single most important gap.

---

## Phase A. Recon and groundwork

**Status: DONE**

| Item | Notes |
| --- | --- |
| A1 | Read the three planning docs already in the folder |
| A2 | Confirm the real deadline against the clock |
| A3 | Pull `@pollar/core@0.11.3` from npm and read its real API surface |
| A4 | Download the full Pollar docs (`llms-full.txt`, 275KB) as offline reference |
| A5 | Find the corridor model and the rail enum that define the product thesis |
| A6 | Confirm Pollar has zero African corridors |
| A7 | Confirm x402 is not in the shipped SDK, and drop it from the pitch |
| A8 | Write findings to `RECON.md` |

---

## Phase B. Corridor core

**Status: DONE**

This is the part that makes the project more than an app sitting next to Pollar.

| Item | File | Notes |
| --- | --- | --- |
| B1 | `pollar-shapes.ts` | Pollar ramp types mirrored and cited |
| B2 | `types.ts` | Corridor, adapter contract, readiness levels |
| B3 | `rates.ts` | Live FX with source, timestamp, pinned fallback |
| B4 | `store.ts` | Funding record store behind a swappable interface |
| B5 | `adapters/shared.ts` | Quote maths, reference generator, QR, instruction builder |
| B6 | `adapters/nigeria-nip.ts` | Nigeria bank transfer, sandbox |
| B7 | `adapters/kenya-mpesa.ts` | M-Pesa STK push, sandbox |
| B8 | `adapters/planned.ts` | Five corridors that refuse to run |
| B9 | `registry.ts` | Single source of truth, plus Pollar's table for comparison |
| B10 | `engine.ts` | Rail agnostic orchestration |

---

## Phase C. Intent layer

**Status: PARTIAL. Gemini path has never run against the real API.**

| Item | State | Notes |
| --- | --- | --- |
| C1 `types.ts` | DONE | The payment intent shape |
| C2 `rules.ts` | DONE | Deterministic parser, handles all three demo sentences |
| C3 `gemini.ts` | PARTIAL | Written and typechecked, never called with a real key |
| C4 `resolve.ts` | DONE | Validates model output against the registry |
| C5 Live Gemini run | BLOCKED | Needs `GEMINI_API_KEY` |
| C6 Confirm the model name is valid | BLOCKED | `gemini-2.5-flash` is a guess until a real call proves it |

C6 matters more than it looks. If that model id is wrong, the call fails and we silently
fall back to rules. The app would still work, but the Gemini claim in the README would be
false.

---

## Phase D. API routes

**Status: DONE**

| Item | Route |
| --- | --- |
| D1 | `POST /api/intent` |
| D2 | `GET /api/corridors` |
| D3 | `POST /api/quote` |
| D4 | `POST /api/funding` and the reference sub routes |
| D5 | `POST /api/funding/rehydrate` for cold serverless instances |
| D6 | `GET /api/funding/pending` for the operator queue |

---

## Phase E. Interface

**Status: DONE**

| Item | Notes |
| --- | --- |
| E1 | Design tokens. Amber is our leg, cyan is Pollar's, amber tag means simulated |
| E2 | UI primitives |
| E3 | Route rail with the visible hand-off seam |
| E4 | Composer with worked examples |
| E5 | Plan screen: intent, corridor, fee breakdown |
| E6 | Fund screen: Pollar shaped instructions, settlement timeline |
| E7 | Hand-off and payment passport |
| E8 | Corridor registry page |
| E9 | Operator console |
| E10 | Country flags as images, because emoji flags do not render on Windows |
| E11 | Responsive check at 375, 1024 and 1440. No clipping, no overflow |

---

## Phase F. Git discipline and commit history

**Status: DONE. 44 commits, working tree clean, history audited for secrets.**

The project started this phase with a single commit and a large pile of uncommitted work.
The finished work was split into logical commits that each stand on their own. From here
on, each task is committed on its own as it lands.

| Item | Planned | Notes |
| --- | --- | --- |
| F1 | 2 | Tooling, dependencies, scripts, env example |
| F2 | 1 | Recon notes |
| F3 | 10 | Corridor core, one commit per module |
| F4 | 4 | Intent layer |
| F5 | 4 | API routes |
| F6 | 9 | Interface, one commit per screen or component group |
| F7 | 2 | Settlement setup script and Pollar config |
| F8 | 2 | Smoke suite |
| F9 | 3 | README, submission material, roadmap and handoff |

Actual outcome: 44 commits. The remaining phases should carry the project past 50 if each
task is committed on its own.

Rules being followed: no co-author line, professional subject lines, no em-dashes in
messages.

---

## Phase G. Next.js 16 compliance audit

**Status: TODO**

AGENTS.md says to read `node_modules/next/dist/docs/` before writing code, because this
Next.js version has breaking changes that may not match what I already know. I wrote the
app without doing that. The code builds clean and typechecks clean, so nothing is obviously
broken, but that is not the same as being correct.

| Item | Notes |
| --- | --- |
| G1 | Read the App Router docs shipped in the package |
| G2 | Check route handler signatures, especially the async `params` pattern |
| G3 | Check `LayoutProps` and `PageProps` generated types |
| G4 | Check caching and `dynamic` defaults, since our funding routes must never cache |
| G5 | Check anything flagged as deprecated |
| G6 | Fix whatever the audit finds |

---

## Phase H. Pollar hand-off, end to end

**Status: BLOCKED on dashboard configuration**

This is the phase that decides whether the submission is strong or merely tidy.

| Item | State | Blocker |
| --- | --- | --- |
| H1 Publishable key in `.env.local` | DONE | |
| H2 Key verified against the live API | DONE | Confirmed valid, header is `x-pollar-api-key` |
| H3 Allow `http://localhost:3000` | BLOCKED | Dashboard, Build then Domains |
| H4 Fund the reserve wallet | BLOCKED | Dashboard, Treasury then Account Funding |
| H5 Turn on sponsorship | BLOCKED | Dashboard, Treasury then Sponsorship |
| H6 Add the USDC trustline | BLOCKED | Dashboard, Treasury then Tokens and Trustlines |
| H7 Sign in and confirm a wallet is created | TODO | Needs H3 |
| H8 Get testnet USDC into the wallet | TODO | May need the Circle faucet |
| H9 Run one real transfer and capture the hash | TODO | The proof the whole project rests on |
| H10 Confirm the passport shows a working explorer link | TODO | |
| H11 Fallback: switch to XLM if USDC cannot be obtained | TODO | Already supported by an env var |

---

## Phase I. Testing and hardening

**Status: PARTIAL. 34 checks passing, all on the African leg.**

| Item | State | Notes |
| --- | --- | --- |
| I1 Corridor and intent smoke suite | DONE | 34 checks |
| I2 Rate feed failure path | TODO | Prove the pinned fallback works when the feed is down |
| I3 Quote expiry path | TODO | Currently written but never tested |
| I4 Cold start rehydrate path | TODO | The sessionStorage safety net is untested |
| I5 Gemini timeout and failure path | TODO | Prove it falls back to rules cleanly |
| I6 Error states in the interface | TODO | Walk each failure and check the message is useful |
| I7 Full manual run through on a clean browser profile | TODO | |

---

## Phase J. Deployment

**Status: TODO**

| Item | Notes |
| --- | --- |
| J1 | Push the repository to GitHub |
| J2 | Connect the project to Vercel |
| J3 | Set environment variables in Vercel |
| J4 | Add the Vercel URL to Pollar allowed domains, since wildcards are not supported |
| J5 | Run the full flow against the deployed site |
| J6 | Confirm the funding store survives a real serverless cold start, or accept the rehydrate path |

---

## Phase K. Documentation

**Status: PARTIAL**

| Item | State | Notes |
| --- | --- | --- |
| K1 `RECON.md` | DONE | |
| K2 `README.md` | DONE | Update once the hand-off actually runs |
| K3 `SUBMISSION.md` | DONE | Fill in the live links |
| K4 `ROADMAP.md` | DONE | This file |
| K5 `HANDOFF.md` | DONE | Living progress tracker |
| K6 Remove em-dashes from project docs | TODO | Preference noted late, existing docs still have them |
| K7 Screenshots or a short recording | TODO | |

---

## Phase L. Submission

**Status: TODO. Hard deadline 2026-09-18 13:00 UTC.**

| Item | Notes |
| --- | --- |
| L1 | Final pass over the README claim table, so nothing overstates |
| L2 | Record the demo, following the script in `SUBMISSION.md` |
| L3 | Fill live and repository links into `SUBMISSION.md` |
| L4 | Submit on Boundless |
| L5 | Post in the Pollar Telegram if that helps visibility |

---

## Phase M. Bonus work, only if the core is finished

**Status: TODO. Do not start any of this while Phase H is open.**

| Item | Notes |
| --- | --- |
| M1 Earn until needed | Park eligible USDC in Blend or DeFindex while a payment waits. Needs Earn switched on in the dashboard, otherwise the provider list comes back empty |
| M2 Scheduled payments | The parser already produces the timestamp. Nothing consumes it yet |
| M3 KORA Split | Many recipients from one funding event |
| M4 A third live corridor | Ghana or Uganda, if a sandbox credential appears |

---

## The order I suggest

1. ~~**Phase F**, commit history.~~ Done.
2. **Phase G**, the Next.js audit, because it may change code and is better done before more is written.
3. **Phase H**, the hand-off, the moment the dashboard is configured.
4. **Phase J**, deploy.
5. **Phase I**, hardening.
6. **Phase L**, submit.
7. **Phase M**, bonus, only with time to spare.
