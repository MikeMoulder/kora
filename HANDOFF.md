# KORA Handoff

Living progress tracker. Updated at the end of every task.

**Last updated:** 2026-09-18
**Deadline:** 2026-09-18 13:00 UTC
**Current phase:** N, interface revamp
**Commits:** 85

---

## Next task

**Three things, all waiting on a person rather than on code.**

The app is deployed to production at
`https://kora-mikes-projects-7ac9bd1b.vercel.app`, project `mikes-projects-7ac9bd1b/kora`,
build clean across 18 routes. It is not usable yet for two reasons.

**1. Turn off Vercel Deployment Protection.** Every URL answers 302 to an SSO login, so
judges cannot open it and Flutterwave cannot deliver a webhook. Vercel dashboard, project
`kora`, Settings then Deployment Protection, set Vercel Authentication to Disabled.

Worth knowing before flipping it: `/operator` and the confirm endpoint behind it become
public too. On testnet with simulated money that is an acceptable trade for a demo, but it
is a real door.

**2. Push the environment variables.** The project has none at all, so the deployment runs
fully degraded. From the repo, with `.env.local` populated:

```
for k in NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY POLLAR_SECRET_KEY NEXT_PUBLIC_SETTLEMENT_ADDRESS \
         SETTLEMENT_SECRET NEXT_PUBLIC_STELLAR_NETWORK NEXT_PUBLIC_SETTLEMENT_ASSET \
         GEMINI_API_KEY GEMINI_MODEL FLW_SECRET_KEY NEXT_PUBLIC_FLW_PUBLIC_KEY FLW_SECRET_HASH; do
  v=$(grep "^$k=" .env.local | cut -d= -f2-)
  [ -n "$v" ] && printf '%s' "$v" | npx vercel env add "$k" production --force
done
npx vercel deploy --prod --yes
```

The redeploy is not optional: `NEXT_PUBLIC_` values are inlined at build time, so the
existing build has empty strings baked in.

Then add the deployed origin to Pollar under Build then Domains, and set the Flutterwave
webhook to `<deployed-url>/api/funding/flutterwave/webhook` with the secret hash from
`.env.local`.

**3. Sign in to Pollar on the hand-off screen and finish the transfer.**

This is the flagship requirement and it is now one click from done. The African leg runs
end to end: intent parsed, corridor resolved, quote priced from the live rate, funding
reference issued, payment reported, settled. The hand-off screen renders and offers
Continue with Google. Nobody has clicked it yet, so the Pollar transfer has still never
run and there is still no Stellar transaction hash to show a judge.

Walk it at `/send?intent=Send ₦250,000 to Carlos Mamani in Bolivia for the brand system.`

Then Phase N8 below.

**Phase N8. Restyle the operator console.**

It is the last screen still on the deleted amber and cyan tokens, so it currently
renders unstyled. Everything else has been converted.

Phase J, deploy, is done: the app is live on Vercel and building cleanly.

One smaller thing is still open, not blocking:

- Two older copy buttons, in `src/components/ui.tsx` and `src/components/ui/primitives.tsx`,
  still call `navigator.clipboard` directly with no fallback and no feedback. They have the
  bug the receive panel was fixed for. `copyText` in `src/lib/utils.ts` is the replacement.
  Left alone because `primitives.tsx` is uncommitted work in progress.

---

## Earlier decision, now settled

**Phase N4. How a monochrome interface shows which leg belongs to whom.**

Colour currently carries the central argument of the project: amber is the leg KORA built,
cyan is the leg Pollar owns. Black and white removes that. Something has to replace it
before the rest of the screens are restyled, because it affects every component.

Settled on fill and weight, zero colour. Solid black is the leg KORA built, a hairline
outline is the leg Pollar owns, a dashed outline is simulated. It survives greyscale, a
washed out projector and a colour blind reader, none of which the amber and cyan version
did. The three rules live as `leg-ours`, `leg-theirs` and `leg-simulated` in globals.css so
components cannot drift from them.

Phase G, the Next.js audit, is still outstanding but partly addressed: the navigation and
useSearchParams docs were both read before the code that needed them, which is how the
react-router-dom swap and the Suspense boundary were confirmed correct.

---

## Pollar, unblocked

Cleared on 2026-09-18. Every check the readiness probe runs now passes.

| Setting | Where | State |
| --- | --- | --- |
| `http://localhost:3000` | Build then Domains | Done. Browser SDK returns 200 `SDK_APPLICATION_CONFIG` |
| Fund the reserve wallet | Treasury then Account Funding | Done. Wallet provisioning returns 201 |
| Turn on sponsorship | Treasury then Sponsorship | Done. Provisioned accounts come back sponsored |
| Add USDC | Treasury then Tokens and Trustlines | Done. New wallets carry a USDC trustline at creation |

Verify any time with `curl http://localhost:3000/api/pollar/status` — add `?deep=1` to
exercise wallet provisioning, which registers a throwaway user each call.

**What the investigation found.** Pollar has two doors that fail independently. The browser
SDK talks to `sdk.api.pollar.xyz` with the publishable key and is checked against the
allowed origins. The Server API talks to `server.api.pollar.xyz` with the secret key and is
not origin checked at all, so backend calls worked throughout, even while the dashboard was
empty. The 403 was never a CORS problem: it rejected with and without an Origin header,
because the allowed list was empty rather than wrong.

Two docs claims did not survive contact with the live API. `WALLET_CREATION_FAILED` is
documented as a transient Stellar fault and is in fact what an unfunded reserve wallet
returns, three times out of three. And wallet provisioning returns `walletAddress` and
`funded` on the user object, not the nested `wallet.publicKey` the rest of the reference
implies.

Still outstanding, and both small:

- Add the deployed URL to Build then Domains once the app is deployed. Localhost alone will
  not serve judges.
- Optional `GEMINI_API_KEY` in `.env.local`, from aistudio.google.com/apikey. The app works
  without it and says which parser ran.
- Still waiting on the replacement image for the sign in brand panel.

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
| 2026-09-18 | Typecheck during sign in work | `npx tsc --noEmit` | Whole project | Clean, run 4 times |
| 2026-09-18 | Production build with sign in | `npm run build` | 12 routes | Clean |
| 2026-09-18 | Smoke regression after revamp start | `npm run smoke` | 34 checks | All passed |
| 2026-09-18 | Sign in flow, browser | Submit to redirect | 1 full run | Session written, redirected to / |
| 2026-09-18 | Sign in layout, 1280px | Browser measurement | Overflow, image ratio | Clean after fix |
| 2026-09-18 | Sign in layout, 390px | Browser measurement | Overflow | None, brand panel correctly hidden |
| 2026-09-18 | Console audit, sign in | Browser console | Warnings and errors | 1 image warning found and fixed, Pollar 403s remain |
| 2026-09-18 | Video playback, sign in | Browser state probe | readyState, paused, opacity | Plays, fade-in correct, freeze traced to a hidden pane |
| 2026-09-18 | Cross-rate endpoint | `curl /api/rates` | 4 African + 3 payout | All live, sourced and dated |
| 2026-09-18 | Dashboard render, 1440px | Browser | Layout, panels | Clean |
| 2026-09-18 | Kora Agent, browser | Sentence to parsed intent | 1 full run | Parsed by Gemini, corridor resolved |
| 2026-09-18 | Beneficiaries panel | Browser | Search, list, pay | Working |
| 2026-09-18 | Dashboard to engine handoff | `/send?intent=` | 1 full run | Auto-parsed, quoted live at 250,000 NGN to 186.48 USDC |
| 2026-09-18 | Production build with dashboard | `npm run build` | 14 routes | Clean |
| 2026-09-18 | Smoke after dashboard | `npm run smoke` | 34 checks | All passed, no regression |
| 2026-09-18 | Typecheck during overview cleanup | `npx tsc --noEmit` | Whole project | Clean, run 5 times |
| 2026-09-18 | Smoke after overview cleanup | `npm run smoke` | 34 checks | All passed, no regression |
| 2026-09-18 | Console audit, overview | Browser console | Errors | Only the known Pollar 403s |
| 2026-09-18 | Overview layout, 1440px | Browser measurement | Overflow | None |
| 2026-09-18 | Overview layout, 1024px | Browser measurement | Overflow | None |
| 2026-09-18 | Overview layout, 800px | Browser measurement | Overflow, rail fallback | None, panel triggers shown |
| 2026-09-18 | Overview layout, 375px | Browser measurement | Overflow | None |
| 2026-09-18 | Panel open and close, 1440px | Browser | Rail to panel to close | Opens, reflows, closes back to overview |
| 2026-09-18 | Panel open, 375px | Browser DOM probe | Panel mounts below main | Present, no overflow |
| 2026-09-18 | Typecheck during balance card wiring | `npx tsc --noEmit` | Whole project | Clean, run 3 times |
| 2026-09-18 | Smoke after balance card wiring | `npm run smoke` | 34 checks | All passed, no regression |
| 2026-09-18 | Clipboard, async API | Browser probe | Write permission | Denied in the preview, fallback took over |
| 2026-09-18 | Clipboard, both paths sabotaged | Browser probe | Refusal message | Shown, no false tick |
| 2026-09-18 | Convert maths, GHS | Browser | 250,000 NGN at 0.0086 | GH2,150, matches the feed |
| 2026-09-18 | Convert maths, USDC | Browser | 100,000 NGN at 1,330.27/USD | 75.17, matches the peg |
| 2026-09-18 | Convert to Send handover | Browser | Amount carried | 250,000 seeded into the send panel |
| 2026-09-18 | Draft clearing | Browser | Rail open after a handover | Back to the 100,000 default, no stale amount |
| 2026-09-18 | Convert panel, 375px | Browser measurement | Overflow, chip clipping | None |
| 2026-09-18 | Receive panel, 375px | Browser measurement | Overflow, value clipping | None |
| 2026-09-18 | Pollar SDK API, no Origin | `curl` | 1 | 403 `ORIGIN_NOT_ALLOWED` |
| 2026-09-18 | Pollar SDK API, with Origin | `curl` | 1 | 403, so not a CORS fault |
| 2026-09-18 | Pollar Server API, secret key | `curl` tokens/verify | 1 | 401 invalid token, key accepted |
| 2026-09-18 | Pollar user registration | `curl` /v1/users | 1 | 201 `SERVER_USER_REGISTERED` |
| 2026-09-18 | Wallet provisioning, empty reserve | `curl` /v1/users/with-wallet | 3 | 502 all three, not transient |
| 2026-09-18 | Wallet provisioning, funded reserve | `curl` /v1/users/with-wallet | 1 | 201 `SERVER_USER_WALLET_CREATED` |
| 2026-09-18 | Provisioned wallet on chain | Horizon testnet | 1 | Sponsored, USDC trustline present |
| 2026-09-18 | Browser SDK after the domain fix | Browser fetch, real key | 1 | 200 `SDK_APPLICATION_CONFIG` |
| 2026-09-18 | Console across a clean reload | Browser | Error count | 50 before, 50 after, no new errors |
| 2026-09-18 | Readiness probe | `/api/pollar/status?deep=1` | 3 checks | All pass |
| 2026-09-18 | Corridor walkthrough after unblock | Browser, intent to hand-off | 1 full run | Settled, hand-off screen reached |
| 2026-09-18 | Smoke after the region trim | `npm run smoke` | 34 checks | All passed |
| 2026-09-18 | Typecheck across the region trim | `npx tsc --noEmit` | Whole project | Clean, run 6 times |
| 2026-09-18 | Rate feed after the trim | `curl /api/rates` | 1 | Peg and 3 payouts, no cross rates |
| 2026-09-18 | Dashboard after both removals | Browser | Layout, balance | Two columns, no dead space |
| 2026-09-18 | Smoke after the Flutterwave rewire | `npm run smoke` | 34 checks | All passed, no regression |
| 2026-09-18 | Corridor fallback with no FLW key | Browser, intent to funding | 1 full run | Fixed account, operator step shown |
| 2026-09-18 | Webhook, no secret configured | `curl` | 1 | 401, refuses rather than accepting |
| 2026-09-18 | Webhook, wrong `verif-hash` | `curl` | 1 | 401 bad signature |
| 2026-09-18 | Webhook, right hash, unknown ref | `curl` | 1 | 200, no retry storm |
| 2026-09-18 | Webhook, right hash, wrong event | `curl` | 1 | 200 ignored |
| 2026-09-18 | Webhook, right hash, real ref, issuer unreachable | `curl` then status read | 1 | Did not credit, stayed awaiting_payment |
| 2026-09-18 | Production build | `npm run build` | 18 routes | Clean |
| 2026-09-18 | Flutterwave charge, live test keys | `curl` v3 charges | 1 | Virtual account issued |
| 2026-09-18 | Flutterwave auto settlement | `verify_by_reference` | 3 polls | successful, 250,000 NGN |
| 2026-09-18 | Corridor with Flutterwave, first run | API, quote to status | 1 full run | Funded, but passed through `expired` |
| 2026-09-18 | Corridor with Flutterwave, after the expiry fix | API, quote to status | 1 full run | awaiting_payment to funded, 186.4814327 USDC |
| 2026-09-18 | Smoke after the expiry fix | `npm run smoke` | 34 checks | All passed |
| 2026-09-18 | Deployment reachability | `curl` root and webhook | 2 | Both 302, SSO protection on |

**Total automated checks passing: 34.**

### What the tests caught

- The shape parity test caught a real bug. A code comment claimed the QR SVG used
  `currentColor` so it would follow the page theme. It did not, because the QR library
  paints with `stroke` and the replacement only looked for `fill`. The claim was false
  until the test forced it true.
- The 800px layout measurement caught the country name clipping inside the route rail.
- The console audit caught a `next/image` aspect ratio warning. Tailwind's `w-auto` class
  was not enough, because Next inspects the inline style. Setting `style={{ width: 'auto' }}`
  cleared it.
- The copy button looked finished and did nothing. The embedded preview refuses
  `navigator.clipboard.writeText` outright, and the first version caught that and stayed
  silent, so the control was dead with no way to tell. It now falls back and, when both
  paths fail, says so. Verified by sabotaging both paths in the page and watching the
  refusal render.
- The 375px scroll check looked like a paint bug in the new gradient: scrolled captures
  came back blank. Reproducing it on `/corridors`, a page the change never touched, showed
  it was the browser pane's mobile capture rather than the CSS. Worth recording, because
  the next person to screenshot a scrolled phone viewport will see the same thing and
  reach for the same wrong conclusion.

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

### Phase N, interface revamp, started

Sign in screen built in the new black and white direction, at `/signin`. Adapted from the
supplied reference with two forced changes: `react-router-dom` swapped for
`next/navigation`, since this is App Router, and the blue accents replaced with a neutral
scale.

The supplied logo was an opaque PNG with the background baked in, so it could not sit on
any surface except its own shade. `npm run prepare:logo` now derives a transparent trimmed
mark from it, 893 KB down to 46 KB.

### Phase N, dashboard

The reference dashboard rebuilt in monochrome and rebased on the naira. Rail, balance card,
African currency strip quoted per 1,000 naira from the live feed, activity list, dot matrix
spend chart, and a right hand workspace the rail switches between a manual keypad, Kora
Agent and the beneficiary book.

Kora Agent reads a sentence into a structured intent and stops. It holds no signer. Both it
and the manual keypad compose the same sentence and hand it to the same corridor engine at
`/send`, so there is no second payment path to keep honest.

Photo avatars were replaced with monogram discs, filled for a person and outlined for a
business. Money in and out is carried by arrow direction and fill rather than green and
red, so it survives greyscale.

### Phase N, overview cleanup

The dashboard mounted the send panel on load, so the first thing the account showed was a
half composed payment nobody had asked for, next to a balance it was already quoting
against. Overview is now the resting state and holds the full width. The workspace panel
opens from the rail, or from Pay on the balance card, and carries its own title and close
because the rail is hidden below `lg`. Narrow screens get a row of three triggers in the
rail's place.

Restyled against the supplied reference at the same time:

- The canvas runs mint to its deep stop on the diagonal rather than sitting as a pale flat
  field, and the card carries a wash of the same mint, heaviest at the top left and gone by
  the middle. The wash is what makes white cards read as objects on a surface.
- Every recent activity row became its own card. Each line is a separate event with its own
  counterparty and direction, so a shared frame was claiming a relationship that is not
  there.
- The rail dropped its divider and its own fill so it sits on the surface. The workspace
  panel stays white, both as the reference has them.
- Removed the subtitle, which described a Latin America use case the corridor registry does
  not serve, and the sample data note, which restated in small grey type what the corridor
  pages already say plainly.

### Phase N, balance card actions

Pay, Convert and Receive all work now. Convert and Receive open panels of their own,
reached from the money they act on rather than from a rail that would then need eight
icons.

**Convert** is a rate, not a wallet. It reads the same live feed the quote engine reads and
quotes the naira against the four African cross rates, the three payout currencies and
USDC. USDC leads the list because it is the asset the corridor settles in, which makes it
the one conversion KORA performs rather than merely quotes. The panel cannot move money and
says so, and the figure is mid-market: a real payment adds the rail fee and the spread, and
only the quote at Review knows them. Its button hands the amount to the send panel rather
than opening a second path to the corridor, and that draft survives exactly the hop that
created it.

**Receive** carries the three fields a Nigerian inbound transfer actually needs, bank, NUBAN
and account name, each with its own copy control. No QR: Nigeria has no scannable standard
behind NIP the way Kenya has USSD behind M-Pesa, so a code there would picture a payment
method that does not exist.

Copying goes through `copyText` in `src/lib/utils.ts`, which falls back to `execCommand`
when the async clipboard is refused and reports whether the text landed.

### Phase O, one region and a real collections partner

The account became Nigeria only. The African currency strip and the Convert panel both
went, because quoting the naira against the cedi, the shilling and the rand implied a
multi currency balance that does not exist, and what the naira becomes is already answered
by the quote in Send against the real corridor. The cross rates came out of the rate feed
with them, so nothing serves a claim the product no longer makes. The balance card is Pay
and Receive, and the spend chart moved under it to close the gap.

Then the Nigerian leg stopped simulating the part that mattered. The NIP adapter always
described the right shape and its own readiness note named the missing piece: a licensed
collections partner issuing virtual accounts. Flutterwave is that partner, and its test
environment issues real ones.

With a key configured, the corridor asks Flutterwave for a fresh virtual account per
payment, using the reference the user already quotes as the charge `tx_ref`. Attribution
becomes the account rather than a human reading a narration off a statement. The expiry is
Flutterwave's and it enforces it. The amount shown is Flutterwave's `transfer_amount`
rather than our quote, because it adds its fee on top and printing our figure produces a
transfer that never reconciles. `requiresOperatorConfirmation` goes false, because
confirmation is a verification call now.

Without a key, or when a charge fails, it falls back to the fixed sandbox account and says
so in the readiness note and in the timeline. The corridor never silently degrades.

The webhook follows three rules in order: authenticate, never trust the body, check the
money. The middle one is the one worth keeping. A correctly signed `charge.completed` on a
real funding reference was probed against a server that could not reach Flutterwave, and
it did not credit: the reference stayed at `awaiting_payment` with no USDC released.

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
6. **The operator console is visually broken.** Converting the design tokens removed the
   amber and cyan ones it still references. It is the last unconverted screen.
7. **The panel video is 15.7 MB and cannot be compressed here**, since there is no ffmpeg
   on this machine. The sign in panel layers it over a finished composition so the page
   never depends on it arriving.
