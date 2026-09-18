# KORA Handoff

Living progress tracker. Updated at the end of every task.

**Last updated:** 2026-09-18
**Deadline:** 2026-09-18 13:00 UTC
**Current phase:** Y, deployed
**Commits:** 167

---

## Next task

**Deploy.** Scheduled payments are done, tested and on the ledger. Nothing is pushed to a
remote and nothing is deployed, so 163 commits of this exist only on this machine and a
judge has no link. That is now the largest single risk to the submission.

Four things to check the moment it is up, because none is exercised by the build:

- `/dashboard` with no cookie has to answer a redirect to `/` on the deployed host. The
  proxy runs at the edge on Vercel rather than inside the Node server, which is a
  different execution path to the one tested here.
- `/signin` has to answer 307 to `/`. It is configured in `next.config.ts` rather than in
  code, so a stale build would drop it silently.
- `/api/schedule` has to answer with `durable: true`. It reads `hasRedis()`, and the
  Upstash variables have to exist in Vercel's environment as well as in `.env.local`. If
  it comes back false, every scheduled payment is being held in a serverless function's
  memory, which is the worst possible place for money to be reserved.
- `/api/schedule` has to answer with `runner: 'cron'`, which means `KORA_RUNNER_SECRET`
  reached the deployment. If it says `dashboard`, the run route is open to the internet.
- The VPS timer has to be wired up. `runner: 'cron'` only means the browser has stopped
  driving it, not that anything has started. Set `KORA_RUNNER_SECRET` and forget the timer
  and every scheduled payment sits held forever, with the panel truthfully saying a
  scheduler is expected.

Order matters on those last two: install the timer first, then set the secret. The other
way round leaves a window where nothing at all sends payments.

**The VPS.** `scripts/kora-runner.sh` carries its own install instructions for both cron
and a systemd timer. Keep `/etc/kora-runner.env` at mode 600; it holds the value that
decides when payments fire. Verify with `systemctl list-timers kora-runner.timer` and
`journalctl -u kora-runner.service -f`, and confirm a real payment lands rather than
trusting the timer's own log.

Add the deployed URL to Pollar under Build to Domains. Domains has no wildcards, so the
preview URL and the production URL are two separate entries. It is matched character for
character, confirmed in phase W3: `https://localhost:3000` and `http://127.0.0.1:3000`
both fail where `http://localhost:3000` passes. An SDK call from a host that is not listed
returns 403 `ORIGIN_NOT_ALLOWED`, which reads like a bug rather than a setting.

**Then: the submission write-up.** `SUBMISSION.md` has not been re-read since the
dashboard, the payments work, the gate or any of this. Scheduled payments are the newest
argument and are not in it.

The strongest artefacts are the transactions. The scheduled one is the better story,
because it was sent by the runner rather than by a person:

```
scheduled  66f336a230374a604c54e8da8c500db099394151c652cc9a93dd21df2157fed2
           ledger 4741094, successful, 0.7047460 USDC to Maria Quispe
           reserved from the balance five seconds earlier, delivered with nobody watching
           https://stellar.expert/explorer/testnet/tx/66f336a230374a604c54e8da8c500db099394151c652cc9a93dd21df2157fed2

immediate  2c44ae641c27913d7e7fdb19ecdcf8ac6273e6ca1ba67dbe830b1eb767530508
           ledger 4736230, successful, 14.8804771 USDC to Carlos Mamani
           https://stellar.expert/explorer/testnet/tx/2c44ae641c27913d7e7fdb19ecdcf8ac6273e6ca1ba67dbe830b1eb767530508
```

**Worth doing if there is time, in this order:**

1. ~~**The duplicate-runner hazard.**~~ Addressed in phase X, by making two runners
   impossible rather than by making the write atomic. The secret cannot be given to a
   browser, and `flock -n` on the VPS means one timer and no overlap. The unlocked read,
   check, write in `redisSchedule.transition` is still there and still has the right
   signature for a Lua script; it now needs two independently configured hosts holding the
   same secret to matter.
2. ~~**A cron.**~~ Done, and pointed at a VPS rather than at Vercel Cron, which does not
   promise exactly-once.
3. **The README `## Layout` block** is stale. It lists `src/app/corridors/`, `RouteRail`
   and `Passport`, none of which exist. It also has no mention of scheduling.
4. **The transaction list draws the same counterparty several times in a row** on some
   days. The opening history walks the beneficiary list forward within a day so two
   payouts on one date are never the same person, but nothing stops a run across
   consecutive days. Cosmetic, and it is the first thing on the dashboard.
5. **Housekeeping, unactioned on purpose:** `AGENTS.md` asks for every `.md` except the
   README and its dependencies to be gitignored. Ten are tracked today, including
   `SUBMISSION.md` and this file. Untracking them is not something to do quietly the day
   of a deadline, so it is flagged rather than done.

**Suspended, not abandoned.** Pollar Earn was probed and then dropped on request. Phase W3
records what was found, `npm run probe:earn` still runs, and nothing in the app imports
it. If it comes back, the blocker is that Earn needs a signed in Pollar user rather than
just the publishable key.

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
| 2026-09-18 | Typecheck during the front door work | `npx tsc --noEmit` | Whole project | Clean, run 4 times |
| 2026-09-18 | Production build, routes swapped | `npm run build` | 23 routes | Clean, / and /dashboard prerendered |
| 2026-09-18 | Production build, proxy added | `npm run build` | 23 routes + Proxy | Clean, Proxy listed in the route table |
| 2026-09-18 | Gate, no session | Browser, GET /dashboard | 1 | Redirected to /, sign in rendered |
| 2026-09-18 | Gate, signed in | Browser, GET / | 1 | Redirected to /dashboard |
| 2026-09-18 | Old route redirect | Browser, GET /signin | 1 | 307 to /, then on to /dashboard |
| 2026-09-18 | Sign in submit | Browser, form to dashboard | 1 full run | Cookie written, landed on /dashboard |
| 2026-09-18 | Sign out | Browser, header control | 1 full run | Cookie cleared, landed on / |
| 2026-09-18 | Back after sign out, before the guard | Browser history | 1 | Failed, dashboard restored from the client router cache |
| 2026-09-18 | Back after sign out, after the guard | Browser history | 1 | Passed, the sign in form is what remains |
| 2026-09-18 | Guard on pageshow | Browser, cookie cleared then event fired | 1 | Redirected to / |
| 2026-09-18 | Server gate behind a stale client | Browser fetch of /dashboard | 1 | opaqueredirect, server still refusing |
| 2026-09-18 | Console audit, gate | Browser console | Errors | None |
| 2026-09-18 | Smoke regression after the gate | `npm run smoke` | 34 checks | All passed |
| 2026-09-18 | Final production build | `npm run build` | 23 routes + Proxy | Clean |
| 2026-09-18 | API not gated | Browser fetch of `/api/rates`, no cookie | 1 | 200 with live rates, matcher confirmed |
| 2026-09-18 | Gate layout, 375px | Browser measurement | Overflow | None, sign out fits beside the bell |
| 2026-09-18 | Panel contrast before the fix | Frame sampling across the clip | 10 frames | Worst 3.3:1 at 13px, under the 4.5 AA floor |
| 2026-09-18 | Panel contrast after the fix | Frame sampling across the clip | 10 frames | 5.0 to 10.0, worst 5.03, passes |
| 2026-09-18 | Glass compositing cost | rAF timing over playing video | 120 frames | 61fps, worst frame 17.2ms |
| 2026-09-18 | Sign in layout after the restyle | Browser measurement, 1440 and pane width | Overflow | None |
| 2026-09-18 | Card contrast across the clip | Frame sampling behind the paragraph | 10 frames | 6.09 to 9.14, worst 6.09, passes |
| 2026-09-18 | Card compositing cost | rAF timing over playing video | 120 frames | 60.3fps, worst frame 17.1ms |
| 2026-09-18 | Card fit at the lg breakpoint | Browser measurement, 1024 | Overflow | None, 384 card in a 416 content box |
| 2026-09-18 | Card fit at 1280 | Browser measurement | Overflow | None, 208 of clearance |
| 2026-09-18 | Band contrast across the clip | Frame sampling behind the paragraph | 10 frames | Worst 5.37 at 50 percent tint, passes |
| 2026-09-18 | Tint sweep for the band | Same 10 frames, four tints | 4 settings | 45 fails at 4.83, 50 passes at 5.37 |
| 2026-09-18 | Band compositing cost at 64px blur | rAF timing over playing video | 100 frames | 60.1fps, p95 17.2ms, worst 17.6ms |
| 2026-09-18 | Mask actually applied | Computed style read back | 1 | Confirmed, both spellings supported |
| 2026-09-18 | Band layout at 1024 and 1440 | Browser measurement | Overflow | None |
| 2026-09-18 | Upward fade contrast | Frame sampling behind the paragraph | 10 frames | 5.57 to 8.76, worst 5.57, passes |
| 2026-09-18 | Ramp clearance, tall window | Browser measurement, 1280x720 | 1 | Block at 33.6 percent, ramp ends at 26, clears by 7.6 |
| 2026-09-18 | Ramp clearance, short window | Browser measurement, 1280x620 | 1 | Block at 31 percent, clears by 5 |
| 2026-09-18 | Frame timing after the fade change | rAF over playing video | 0 frames | Not run, pane hidden, previous 60.1fps stands |
| 2026-09-18 | Per pixel contrast, blur 32, text 75 | Canvas blurred at the real radius | 84,096 samples, 12 frames | 4.10, fails the 4.5 floor |
| 2026-09-18 | Per pixel contrast, blur 64, text 75 | Same method, previous setting | 84,096 samples, 12 frames | 4.64, passed by a quarter point |
| 2026-09-18 | Tint and text sweep at blur 32 | Same samples, five settings | 5 settings | 90 percent white passes at 5.08, 60 percent tint at 5.33 |
| 2026-09-18 | Headline contrast after the change | Same method, headline box | 12 frames | 5.25 against a floor of 3.0 |
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
| 2026-09-18 | Deployment after protection off | `curl` 5 paths | 5 | All 200, publicly reachable |
| 2026-09-18 | Production env vars | `vercel env ls` | 9 vars | All set on Production |
| 2026-09-18 | Publishable key inlined in the build | Browser bundle scan | 1 | Present, matches local |
| 2026-09-18 | Production Pollar readiness | `/api/pollar/status` | 2 checks | backend pass, browser blocked on Domains |
| 2026-09-18 | Corridor end to end, production | API, quote to status | 1 full run | Funded, 186.4814327 USDC |
| 2026-09-18 | Logo asset in production | Canvas pixel sample | 1 | Renders correctly, white on transparent |
| 2026-09-18 | Production readiness after the domain add | `/api/pollar/status?deep=1` | 3 checks | All pass |
| 2026-09-18 | Pollar CORS preflight, both origins | `curl` OPTIONS | 2 | 204 with matching allow-origin |
| 2026-09-18 | Browser SDK call from the deployed page | In-page fetch | 1 | 200 `SDK_APPLICATION_CONFIG` |
| 2026-09-18 | Readiness probe after the CORS assertion | `/api/pollar/status` | 2 checks | Still pass, now on evidence |
| 2026-09-18 | Smoke after the probe fix | `npm run smoke` | 34 checks | All passed |
| 2026-09-18 | Payment refused on an empty float | `curl /api/payments` | 1 | Declined before the debit, balance untouched |
| 2026-09-18 | Payment reversal on a failed provision | `curl` then ledger read | 1 | Debit and matching reversal, balance restored |
| 2026-09-18 | Provisioning idempotency | `curl` with a repeated externalId | 2 | Same user and wallet returned |
| 2026-09-18 | **Corridor end to end, real money** | `curl /api/payments` | 1 full run | **Settled, tx 2c44ae64…** |
| 2026-09-18 | Settlement verified on Horizon | Transaction and both accounts | 3 | successful, ledger 4736230, balances match |
| 2026-09-18 | Fee breakdown against the engine | Browser DOM read | 6 rows | Matches the quote exactly |
| 2026-09-18 | Beneficiary to send handover | Browser | 1 | Name, country and account filled, amount empty |
| 2026-09-18 | Build after retiring /send | `npm run build` | 22 routes | Clean |
| 2026-09-18 | Ramp endpoints with a publishable key | `curl` countries and liquidity | 2 | `SDK_AUTH_INVALID_TOKEN`, end user session required |
| 2026-09-18 | Static virtual account, live keys | `curl` v3 virtual-account-numbers | 2 | Docs BVN rejected at 10 digits, 11 works |
| 2026-09-18 | Personal deposit account route | `/api/account/receiving` | 2 calls | Created once, cached, same number |
| 2026-09-18 | Deposit to credit, API | open, poll, balance | 1 full run | 75,000 credited once, balance moved |
| 2026-09-18 | Deposit idempotency | Repeat confirm polls | 2 | Reported already credited, no double credit |
| 2026-09-18 | Deposit to credit, browser | Receive, Add money | 1 full run | 120,000 credited, card moved to 5,015,650 |
| 2026-09-18 | Smoke after the ledger | `npm run smoke` | 34 checks | All passed |
| 2026-09-18 | Smoke after the Redis adapter | `npm run smoke` | 34 checks | All passed, memory fallback intact |
| 2026-09-18 | Redis reachability | REST `/ping` | 1 | PONG |
| 2026-09-18 | Key namespacing in a shared database | REST `keys kora:*` | 1 | Only KORA keys, 6 others untouched |
| 2026-09-18 | Deposit against Redis | API, open to credit | 1 full run | Credited, balance 4,865,650 |
| 2026-09-18 | Ledger idempotency on Redis | Repeat confirm | 1 | Already credited, no second entry |
| 2026-09-18 | Funding record on Redis | API, quote to funded | 1 full run | Funded, key written and indexed |
| 2026-09-18 | Production build with the account routes | `npm run build` | 21 routes | Clean |
| 2026-09-18 | Cross process persistence | Localhost write, production read | 1 | Production read both entries |
| 2026-09-18 | Activity feed assertions | `npm run probe:activity` | 30 checks | 6 failed, all in the test itself, seeded rows outranked the injected one |
| 2026-09-18 | Activity feed, after fixing the test | `npm run probe:activity` | 30 checks | All passed |
| 2026-09-18 | Smoke after the activity feed | `npm run smoke` | 34 checks | All passed, no regression |
| 2026-09-18 | Typecheck through the interface work | `npx tsc --noEmit` | Whole project | Clean, run 9 times |
| 2026-09-18 | Production build with the activity feed | `npm run build` | 23 routes | Clean, run 3 times |
| 2026-09-18 | Spend range switching | Browser, driven select | 3 ranges | Daily 30 columns, weekly 52, yearly 12, dots round in all three |
| 2026-09-18 | Dot grid geometry, 1440px | Browser measurement | Pitch and gap | 10.60px against 10.71px pitch, 4.77px against 4.89px gap, square |
| 2026-09-18 | Avatar fallback with no files present | Browser network log | 7 portraits | Every request 404s once, monogram takes the space, no layout shift |
| 2026-09-18 | Activity endpoint | Browser network log | `/api/account/activity` | 200, list and all three series in one response |
| 2026-09-18 | Real ledger entries in the list | Browser | 6 rows | All six are real movements, each naming its counterparty |
| 2026-09-18 | Portrait request deduplication | Browser resource timing | 3 unique ids across 8 draws | 3 requests, one per id, module-level cache holding |
| 2026-09-18 | Overview layout, 390px | Browser measurement | Horizontal overflow | None, scrollWidth equals clientWidth |
| 2026-09-18 | Typecheck through the restructure | `npx tsc --noEmit` | Whole project | Clean, run 7 times |
| 2026-09-18 | Activity assertions after the series change | `npm run probe:activity` | 33 checks | 1 failed, assertion too strict for a quiet day, loosened |
| 2026-09-18 | Activity assertions, after loosening | `npm run probe:activity` | 33 checks | All passed |
| 2026-09-18 | Smoke after the restructure | `npm run smoke` | 34 checks | All passed, no regression |
| 2026-09-18 | Production build after the restructure | `npm run build` | 23 routes | Clean |
| 2026-09-18 | Column fit, full width | Browser measurement | Plot 1069px | 90 columns at 11.88px pitch, dots round |
| 2026-09-18 | Column fit, workspace panel open | Browser measurement | Plot 709px | 64 columns, dots round, footer relabelled |
| 2026-09-18 | Column fit, 390px | Browser measurement | Plot 309px | 28 columns, dots round, no overflow |
| 2026-09-18 | Top row alignment | Browser measurement | Balance card against list | 319px each, exact |
| 2026-09-18 | Chart in a backgrounded page | Browser, pane not rendering | ResizeObserver delivery | Never fired, chart empty through a full reload, fixed by measuring first |
| 2026-09-18 | Operator route after retirement | Browser | `/operator` | 404, no route in the build |
| 2026-09-18 | Activity panel | Browser DOM probe | 30 rows | Scrolls inside 560px, dated, all portraits loaded |
| 2026-09-18 | Portraits supplied | Browser resource timing | 7 files | All resolve, 4 drawn on the overview, businesses correctly on monograms |
| 2026-09-18 | Motion tokens in the cascade | Browser computed style | 5 rules | press, lift, stagger, panel-in and the reduced-motion block all present |
| 2026-09-18 | Stagger delays | Browser computed style | Rows 1 to 3 | 40ms, 80ms, applied and capped |
| 2026-09-18 | Press composing with colour | Browser computed style | Rail button | 6 properties on one 130ms transition after the shorthand fix |
| 2026-09-18 | Callout glide | Browser computed style | Chart callout and ring | `left` over 220ms, both |
| 2026-09-18 | Typecheck through the motion work | `npx tsc --noEmit` | Whole project | Clean, run 6 times |
| 2026-09-18 | Production build after retirement | `npm run build` | 22 routes | Clean, operator gone |
| 2026-09-18 | Smoke after the motion work | `npm run smoke` | 34 checks | All passed, no regression |
| 2026-09-18 | Portrait payload, before | `stat` over `public/avatars` | 7 files | 17,380,197 bytes served raw |
| 2026-09-18 | Portrait payload, after | `curl` against the production build | 7 files | 10,527 bytes as AVIF at w=96, all `image/avif` |
| 2026-09-18 | Optimiser at the declared quality | `curl /_next/image` q=80 | 1 | 400 before `images.qualities`, 200 after |
| 2026-09-18 | Portraits decode in the browser | `createImageBitmap` on the served bytes | 4 unique | 80x107, 96x144, 96x144, 96x75, all valid |
| 2026-09-18 | srcset widths per drawn size | Browser DOM | 36 to 44px avatars | w=80 and w=96, the retina pairs, no other widths requested |
| 2026-09-18 | Typecheck through the optimiser work | `npx tsc --noEmit` | Whole project | Clean, run 4 times |
| 2026-09-18 | Production build with the optimiser | `npm run build` | 22 routes | Clean, run 3 times |
| 2026-09-18 | Ramps auth, bearer token | `curl sdk.api.pollar.xyz/v1/ramps/*` | 2 endpoints | 401 `API_KEY_NOT_FOUND`, wrong header |
| 2026-09-18 | Ramps auth, `x-pollar-api-key` with Origin | `curl` | 2 endpoints | 401 `SDK_AUTH_INVALID_TOKEN`, the real answer |
| 2026-09-18 | End to end, first run | `npm run e2e` | 40 checks | 1 failed, probe stopped at CORS with 403, evidence too weak |
| 2026-09-18 | End to end, after sending Origin | `npm run e2e` | 40 checks | All passed |
| 2026-09-18 | Corridor through the browser | Manual, form to completion | 1 full run | Three legs rendered, live probe shown, `KORA-PAY-W7RCPE` |
| 2026-09-18 | Smoke after the payout leg | `npm run smoke` | 34 checks | All passed, no regression |
| 2026-09-18 | Activity after the payout leg | `npm run probe:activity` | 33 checks | All passed, no regression |
| 2026-09-18 | Icon scale at tab sizes | Rendered 16 and 32, magnified 6x | 3 candidates | 62% muddy, 74% crowded, 68% chosen |
| 2026-09-18 | Icon set served | Browser fetch | 3 files | `favicon.ico` 200 image/x-icon, `icon.png` and `apple-icon.png` 200 image/png |
| 2026-09-18 | ICO container | Parsed the bytes back | 2 entries | 32x32 and 16x16, both valid PNG, offsets within the file |
| 2026-09-18 | Link tags emitted | Browser DOM | 3 tags | icon 32x32, icon 512x512, apple-touch-icon 180x180 |
| 2026-09-18 | Titles carry no em dash | Browser and `curl /signin` | 2 pages | `KORA \| the African corridor for Pollar`, `Sign in \| KORA` |

**Total automated checks passing: 107.** 34 from `npm run smoke`, 33 from `npm run probe:activity`, 40 from `npm run e2e`.

`e2e` is not in the default run. It spends testnet USDC out of the float and writes to the
real ledger, and it refuses to start rather than half running when the float cannot cover the
payment.

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

| 2026-09-18 | Typecheck during the agent polish | `npm run typecheck` | Whole project | Clean, run 3 times |
| 2026-09-18 | Smoke regression after the agent polish | `npm run smoke` | 34 checks | All passed |
| 2026-09-18 | Agent portrait crop candidates | Rendered at 32px, nearest-neighbour magnified | 9 crops across 2 sweeps | 540 square from (240, 110) picked |
| 2026-09-18 | Agent portrait encoding | Palette against truecolour at 180px and 56px | 2 encodings | Indistinguishable, 491 KB to 123 KB |
| 2026-09-18 | Agent panel, resting state | Browser, 420px | Layout, overflow | Clean, column now fills its height |
| 2026-09-18 | Agent panel, parsed state | Browser, 2 sentences to parsed intent | 2 full runs | Gemini answered both, corridor resolved |
| 2026-09-18 | Destination name, before the fix | Browser, Understood as table | 1 | Failed, printed the ISO code BO |
| 2026-09-18 | Destination name, after the fix | Browser, table and corridor note | 2 | Both read Bolivia |

| 2026-09-18 | Earn probe, no Origin header | `npm run probe:earn` | 6 calls | Misleading, 403 read as an empty Domains list |
| 2026-09-18 | Earn probe, with Origin | `npm run probe:earn` | 6 calls | 401 on the SDK door, 404 on the server door |
| 2026-09-18 | Origin matching | `curl` against 3 spellings | 3 | Only `http://localhost:3000` passes |
| 2026-09-18 | Corridor regression after the settle split | `npm run e2e 1000` | 40 checks | All passed, float 14.2589171 to 13.5541711 |
| 2026-09-18 | Schedule API, happy path | Script against the running server | 9 calls | Reserve, list, run, cancel, all correct |
| 2026-09-18 | Schedule, money balances | Balance before and after cancel | 1 | Delta exactly 0 |
| 2026-09-18 | Schedule, double cancel | `DELETE` twice | 2 | Second refused 400, no second credit |
| 2026-09-18 | Schedule, input guards | Past date, 10 years out, below minimum | 3 | All three refused |
| 2026-09-18 | Scheduled runner, real delivery | Schedule at +5s, wait, run | 1 full run | 1 sent, 0 failed |
| 2026-09-18 | That delivery, on Horizon | `GET /transactions/:hash` | 1 | successful, ledger 4741094, 0.7047460 USDC |
| 2026-09-18 | Runner, second tick | `POST /api/schedule/run` again | 1 | due 0, no second delivery |
| 2026-09-18 | Schedule from the send form | Browser, form to confirmation | 1 full run | Balance 4,877,650 to 4,875,650 |
| 2026-09-18 | Scheduled panel | Browser, held, coming up, already run | 1 | All three sections correct |
| 2026-09-18 | Agent reads a date | Browser, "pay Maria tomorrow" | 1 full run | Gemini returned 19 Sep, form opened scheduled and priced |
| 2026-09-18 | Timing radio state | Computed style and aria-checked | 2 controls | Correct, fill and contrast as specified |
| 2026-09-18 | Typecheck during the schedule work | `npm run typecheck` | Whole project | Clean, run 9 times |
| 2026-09-18 | Smoke during the schedule work | `npm run smoke` | 34 checks | All passed, run 3 times |
| 2026-09-18 | Production build with scheduling | `npm run build` | 26 routes + Proxy | Clean |

| 2026-09-18 | Runner auth, unconfigured | `curl`, no secret set | 2 | Open with no header, 401 with one |
| 2026-09-18 | Runner auth, configured | `curl`, 4 credential shapes | 4 | Missing, bad, right-length-wrong, correct |
| 2026-09-18 | Runner mode reported | `GET /api/schedule` both ways | 2 | dashboard then cron |
| 2026-09-18 | Dashboard stops polling in cron mode | Browser fetch counter, 10s idle | 1 | 0 list calls, 0 run calls |
| 2026-09-18 | Runner script syntax | `bash -n scripts/kora-runner.sh` | 1 | Clean |
| 2026-09-18 | Runner script, nothing due | `bash scripts/kora-runner.sh` | 1 | Silent, correct |
| 2026-09-18 | Runner script, real delivery | Reserve, refuse browser, run script | 1 full run | 1 sent by the script alone |
| 2026-09-18 | That delivery, on Horizon | `GET /transactions/:hash` | 1 | successful, ledger 4741312, 0.7047460 USDC |
| 2026-09-18 | Runner script, second run | `bash scripts/kora-runner.sh` again | 1 | due 0, no duplicate |
| 2026-09-18 | Typecheck with runner auth | `npm run typecheck` | Whole project | Clean, run 3 times |
| 2026-09-18 | Smoke with runner auth | `npm run smoke` | 34 checks | All passed |
| 2026-09-18 | Co-author strip, content safety | `git diff backup HEAD` | 26 commits | Empty, messages only |

| 2026-09-18 | Runner on the VPS, deployment stale | systemd, Ubuntu 24.04 | 1 | 404, HTML flooded the journal |
| 2026-09-18 | curl exit code across builds | Same 404, two curl versions | 2 | 8.5.0 gave 22, Git Bash gave 0 |
| 2026-09-18 | Runner, 404 path | Local, unknown route | 1 | Page described not dumped, hint, exit 22 |
| 2026-09-18 | Runner, unreachable host | Local, closed port | 1 | UNREACHABLE, hint, exit 7 |
| 2026-09-18 | Runner, 401 path | Local, wrong secret | 1 | Body in full, secret hint |
| 2026-09-18 | Runner, 200 nothing due | Local stub | 1 | Silent, exit 0 |
| 2026-09-18 | Runner, 200 one sent | Local stub | 1 | One line, exit 0 |
| 2026-09-18 | Line endings on the VPS | systemd journal | 1 | CRLF, bad interpreter, fixed |
| 2026-09-18 | Deployment carries the routes | VPS runner status | 1 | 404 became 401, route exists |

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

### Phase P, the account is real money now

The balance was a constant, so nothing that happened could show up in it. It is an opening
figure plus an append-only ledger, returned separately so the interface says which part is
sample data and which part happened. Entries are keyed on the partner reference, which
doubles as the idempotency key, because Flutterwave retries a webhook three times over
ninety minutes and a retry must not credit twice.

Receive shows a permanent NUBAN that Flutterwave issued for the account holder. That needed
a BVN, since a permanent Nigerian account number is tied to a verified identity by
regulation; test mode sends the documented placeholder and the panel says the identity is
not real. Live keys with no BVN are refused rather than sent a made up one.

**There is no faucet, and that shaped the design.** Nothing in Flutterwave's sandbox ever
pays into a static account, so the permanent number sits there and no webhook ever fires.
A bank transfer charge is different: it names an amount and test mode pays it itself within
seconds. So Add money opens a charge, and the balance moves because money genuinely
arrived against a reference Flutterwave confirms. In production both paths end in the same
place, a `charge.completed` verified and credited once.

Storage is Upstash Redis behind the same interfaces, memory when it is not configured.

The database is shared with another project of the owner's, which is why every key is
namespaced: `kora:funding:<ref>`, `kora:funding:index`, `kora:ledger:entry:<ref>`,
`kora:ledger:entries`. Namespacing protects against collisions, not against somebody
flushing that database, and the free tier command quota is shared. Both are fine at this
volume and worth knowing before anyone assumes otherwise.

Proven across processes rather than asserted: a deposit made from the browser on localhost
was read back by the production deployment from the same ledger.

### Phase Q, the corridor actually moves money

The corridor had a hole in the middle that three successive errors walked us into. Ada paid
naira to KORA, and then Ada's own Pollar wallet was asked to send USDC that nothing had ever
given it. First it had no XLM for the fee, then no USDC to send, and each fix only revealed
the next gap. The hole was the design, not the balances.

KORA does not issue USDC — Circle does. KORA holds a **float** of it and delivers from that
float against naira it has already received, which is what every remittance company does.
So the float moved to KORA and the wallet moved to the beneficiary.

**Nobody signs in to Pollar any more.** The beneficiary's wallet is provisioned through the
Server API, which needs no human, so a contractor in Bolivia receives a real non-custodial
Stellar wallet without knowing Stellar exists. That removed the sign-in friction and the
`APPLICATION_HAS_NO_REDIRECT_URIS` blocker in the same move.

Order of operations in `POST /api/payments`, and the order is load bearing: quote, check the
balance, check the float, debit, provision, deliver, reverse if delivery failed. Debiting
before sending is deliberate — the other order lets two requests both pass the balance check
and both send. The reversal is a compensating credit carrying its own reference rather than
an edit, because a ledger that can forget is not a ledger. Both halves were exercised for
real: a payment reversed cleanly on a transient provisioning failure before the retry was
added.

`/send` is gone. It asked for naira the account already holds and made the sender sign in to
move USDC their wallet never had. Kora Agent and the beneficiary book now hand a draft to
the send panel instead of navigating with a sentence in the URL.

### Phase R, the dashboard reads from the ledger

The two things the overview showed were hardcoded arrays: a list of seven transactions and
fifty two weeks of spend, both literals in `demo-data.ts`. Neither could be moved by
anything the app did, so a payment could go out through the corridor, leave the balance, and
appear in neither. Worse, neither could ever be *wrong* in a way anybody would notice.

Activity is now built in one place, `lib/account/activity.ts`, from an opening history plus
the real ledger. That is the same opening-plus-movements shape the balance already takes,
and it means a send writes a row and moves the chart because there is only one set of facts
for both to read. Served over `/api/account/activity` rather than imported, because the
history is anchored to the current instant and generating it client side would produce one
series during the server render and another at hydration.

The opening history is generated, not written out. The generator is seeded by calendar day
rather than by position in the window: seeding by position looks identical until midnight,
when every draw shifts a column and twelve months of history quietly rewrites itself.

Ledger entries now carry the counterparty. Entries written before that was a field have
their name read back out of the wording, which is a sentence this code produced and
therefore knows the shape of. Six rows that read "Corridor payment" now read like an
account. Anything unparseable names the rail rather than inventing a person.

**The transaction rows** were rebuilt on the supplied reference: portrait, who and what
happened, how much, and nothing else. The direction badge on the right is gone, since the
sign and the colour already say which way the money went. The small circular glyph after the
status word went with it. It had been carrying the row's provenance in its weight, solid for
a real movement and hairline for opening history, so that signal is now only in the tooltip
on the status word, along with the timestamp and the reason.

**The spend chart** got the daily, weekly and yearly range it was missing, daily by default,
behind a real select rather than the button that did nothing. It also came off SVG: a
viewBox stretched into an arbitrary container with `preserveAspectRatio` none scales x and y
by different factors, so every dot in the old chart was an ellipse. Laid out with flex, a
dot takes its height from its width and is a share of its column, which holds the grid
square at any width and any column count. Measured at 1440px: 10.60px against 10.71px pitch.

**Portraits** land in `public/avatars/`, with `Avatar` painting the monogram disc first and
the image over it. The fallback is on the image error rather than a check that the file
exists, because a client component cannot ask the filesystem anything.

**Three elevations, and only three.** Every white object was carrying its own inline shadow
string, slightly different each time. There is now a row, a panel and the app itself, in
`globals.css`, so the page has a grammar of depth rather than a collection of one-offs.

### Phase R2, the overview restructured

Spend now runs the full width under the balance card and the transaction list, rather than
sharing the left column with the balance. A year of columns is a shape and a shape needs
length; at a third of this width a dot matrix of a year looked like a barcode.

That made the column count a property of the window rather than of the data. The feed now
builds longer series than any one screen draws, ninety days, a hundred and four weeks, sixty
months, off five years of opening history, and the chart takes the tail it can draw at an
11px pitch. Ninety columns at full width, sixty four with the workspace panel open, twenty
eight at 390px. The window label and the total are counted from what is on screen, so
neither can claim more than it shows.

`SpendSeries` lost `total`, `peakIndex` and `window` in the same move. All three described
the whole series and the chart shows a slice of it, so keeping them would have meant two
answers to every question and the wrong one printed under the plot.

The list drops to four rows so it stands beside the balance card rather than towering over
it. Both measure 319px.

**A real bug came out of this.** The chart sized itself from a `ResizeObserver` alone, and an
observer delivers its first callback on the next rendering step. A page that is not being
rendered has no next rendering step, so opening the app in a background tab left the chart
waiting for a measurement that never arrived and drawing nothing. Found in the preview pane,
where a backgrounded page kept the matrix empty through a full reload. The element is now
measured with `getBoundingClientRect` before the observer is attached, which is synchronous
and owes nothing to the compositor.

Shadows are half what they were, the callout included. The three elevations were legible as
three, which was the point, but stacked against a pale green they pooled into a grey the
mint had to fight through.

### Phase S, the operator console retired and the app given motion

`/operator` is gone, along with `components/ui.tsx`, which had no other caller. It was a
reconciliation desk: a queue of funding references waiting for a human to match them against
a bank statement. That desk is real and every African collections operation has one, but it
was never part of this account holder's app, and both entry points into it said so. The rail
filed it under a settings cog; the transaction list linked to it from View all, which
promised a fuller history of the account and delivered somebody else's work queue.

View all now opens an activity panel: the last thirty movements, dated, scrolling inside the
panel rather than growing it and taking the balance off screen. The rail slot goes to the
same panel. `TransactionRow` moved to `parts.tsx`, since the card and the panel draw the same
object. `/api/funding/pending` and the confirm route stay; the desk still exists in the
corridor design, it just has no screen here.

**Motion.** The app had forty `transition-colors`, three `transition-opacity` and one scale.
Nothing answered a press. There are now three durations and two curves in `globals.css`, and
two primitives carrying the whole surface: `press` scales to 0.96, `lift` raises a card one
pixel. Cards rise in, rows stagger 40ms apart capped at the eighth, the panel slides in from
the edge it lives on and is keyed so switching workspaces replays it, and the chart's callout
and ring glide between columns rather than teleporting. Reduced motion turns all of it off
rather than slowing it down.

One trap worth recording: `press` first declared its transition with the `transition`
shorthand, which resets every part of the property and silently cancelled the colour fade on
every control it was added to. The markup looked right, because the Tailwind transition class
was still sitting there being overridden. Longhands fixed it.

### Phase S2, the portraits stopped being a 17MB first paint

The supplied artwork is seven full resolution photographs, 363KB to 5.6MB, 17,380,197 bytes
across the set, every one of them painted at 44 pixels or less. A plain `img` tag shipped all
of it so the browser could discard ninety nine percent during a downscale.

`Avatar` now draws through `next/image`. Measured against the running production build, the
set goes to **10,527 bytes** as AVIF at the 96px variant, which is the retina pair for a 44px
row. The originals are untouched on disk.

`next.config.ts` names only the widths a portrait is ever drawn at, 40, 48, 80 and 96, rather
than Next's default sixteen, so a cold deploy transforms each file a handful of times. Cache
TTL is thirty days. Loading is eager against the default: lazy exists to avoid paying for
pixels nobody scrolls to, and at a kilobyte and a half it only adds an intersection callback
between the page and ten kilobytes.

**The trap, and it cost the first attempt.** Next only serves quality values declared in
`images.qualities`, which defaults to `[75]`, and answers 400 for anything else. A 400 is
invisible here: the image errors, `Avatar` does exactly what it was built to do and falls
back to the monogram, and the interface looks entirely correct while serving none of the
artwork. The build was clean the whole time. Found by measuring the transfer rather than by
reading the diff, which is the only way this class of bug surfaces.

Worth knowing for the next person: the browser pane backgrounds itself, and a page that is
not being rendered never decodes an image. `img.decode()` hangs and `naturalWidth` stays 0,
which looks exactly like a broken image. `createImageBitmap` on the fetched bytes decodes off
the render path and gives a real answer.

### Phase T, the corridor confirmed end to end

The milestone was to prove the whole route runs, not to assume it. `npm run e2e` is now that
proof: forty checks across eleven stages, against a running server, spending real testnet
USDC.

Every assertion is made against something outside the app. Balances come from Horizon rather
than from our own response, the transaction is re-read off the ledger, and the boliviano leg
carries the status code Pollar answered with on that run. An end to end test that only reads
its own output proves the code is self consistent, which was never the question.

**Verified run, 40/40:**

```
reference   KORA-PAY-E7V8Z8
sent        1,000 NGN off the KORA ledger
delivered   0.704746 USDC on Stellar testnet
tx          8a3932998d015fca4128fc90fd5014a15ac0c4f1560481e5c863fc4c90b4acab
            https://stellar.expert/explorer/testnet/tx/8a3932998d015fca4128fc90fd5014a15ac0c4f1560481e5c863fc4c90b4acab
from        GAEHDX7IXJHG2UUCCUES63C7WBLPXJX6IHTA6TGENHDJBSZ65AB7FWQE   KORA treasury
to          GAXMTAOXFC4CZFM3BDA52FC3Q7NHN47XJFXZV7YDQ7TCZJIPQVT63FDA   Carlos Mamani's Pollar wallet
last mile   ~ 7.83 BOB via Stereum ACH, SIMULATED
            401 SDK_AUTH_INVALID_TOKEN from /ramps/quote on that run
```

**The boliviano leg now exists.** It was not mocked, not labelled, not present, which for a
brief asking the African path to hand off cleanly to Pollar was the missing half. Every
payment now returns a `payout` object: the live BOB figure derived from USDC that actually
arrived, the anchor read from the registry, and the exact `/ramps/offramp` body transcribed
from the installed `@pollar/core`. The completion screen draws all three legs under the
existing ownership language.

It never executes and never pretends to. The quote id is a named placeholder rather than a
fake, nothing carries a completed status, and each payment probes `/ramps/quote` live so the
refusal is a status code from that request rather than a claim in a comment.

**The first run failed one check, and it was the evidence rather than the corridor.** The
probe reached Pollar with no `Origin` header, so CORS turned it away with 403
`ORIGIN_NOT_ALLOWED`, which is a true statement about browsers and says nothing about who may
run an off-ramp. Sending the app's own origin gets the request past the door to the decision
actually being cited. Worth knowing generally: `sdk.api.pollar.xyz` checks origin before
auth, so a server-to-server probe reads as a CORS failure unless it names an allowed origin.

Also confirmed: the SDK header is `x-pollar-api-key`, not `Authorization: Bearer`. A bearer
token answers 401 `API_KEY_NOT_FOUND`, which looks like a bad key and is not.

### Known gaps in the corridor, stated plainly

These are real and neither is fixed. They belong in the README rather than being discovered
by a judge.

**1. Nothing validates the recipient's account details.** The send form takes a free-text
"bank and account number", stores it, displays it, and never checks it against anything. A
wrong account number would be accepted, the naira debited and the USDC delivered, and the
error would surface when the recipient said they were never paid.

Where validation belongs is Pollar's ramp, not KORA. `RampFieldSpec` in `@pollar/react`
declares per-country payout fields with `bankType` of `CLABE`, `PIX`, `PSE`, `ACH` or
`BREB`, bank dropdowns sourced from the anchor, placeholder masks and optional flags. The
correct design is that the anchor says what a Bolivian payout needs and KORA collects
exactly that. Flutterwave also verifies bank accounts, but only Nigerian ones, which is the
wrong side of this corridor.

**2. The USDC stops in the beneficiary's wallet.** Nothing cashes it out to bolivianos.

The off-ramp exists and was found rather than assumed: `POST /ramps/offramp`, described as
"funds will be sent from the user's wallet to the provided bank account", alongside
`/ramps/quote`, `/ramps/countries`, `/ramps/liquidity` and `/ramps/kyc-status`. Pollar's
Bolivian anchor is Stereum.

Two things stop it running, and the first is correct behaviour. Calling those endpoints with
the publishable key returns `SDK_AUTH_INVALID_TOKEN`: they require the **end user's** session,
meaning the beneficiary's, not KORA's. A non-custodial wallet should not let the company that
funded it drain the funds back out, so the off-ramp is the recipient's action by design. And
Stereum's BOB ramp is mainnet, so on testnet there is no Bolivian anchor to call at all.

That is why the last leg of the route rail is dashed and labelled SIMULATED, and the label
is accurate rather than a hedge.

### Warts worth knowing

- `SETTLEMENT_SECRET` and `NEXT_PUBLIC_SETTLEMENT_ADDRESS` now name KORA's **treasury**, the
  source of the USDC, not a settlement destination. Same account, opposite role. Renaming an
  environment variable production depends on was not worth the risk on the day.
- `src/components/Composer.tsx` is orphaned. Nothing imports it since `/send` went, but it
  carries uncommitted local edits so it was left rather than force removed.
- The treasury signing key sits in an environment variable. Fine for testnet, not how real
  money is held.

### Other

A real Stellar testnet settlement account, created and funded by a script in the repo,
with a USDC trustline open:
`GAEHDX7IXJHG2UUCCUES63C7WBLPXJX6IHTA6TGENHDJBSZ65AB7FWQE`

### Phase U, sign in became the front door

The brief was small and the hole underneath it was not. Sign in already existed, at
`/signin`, and nothing in the app linked to it. The dashboard answered `/`, so every visitor
landed inside the account without passing the screen built for arriving, and the sign in
work from the earlier phase was effectively dead code with a nice video on it.

**The swap.** `/` is sign in. The dashboard is `/dashboard`. `/signin` answers a 307 to `/`
so a bookmark or a line in a demo script does not produce a 404 in front of an audience,
temporary rather than permanent because a 308 is cached by browsers forever and a week old
project should not commit its routes to anybody's cache.

Three links were pointing at the old shape. The rail logo went to `/`, which had become the
way out of the account rather than the way home. The brand panel carried a back button to
`/`, which had become the page it was drawn on. "Request access" linked to `/signin` from
`/signin`, which was circular before any of this.

**The gate runs on the server.** `src/proxy.ts`, which is what Next 16 calls middleware
since the rename. No session and the dashboard sends you to sign in; a session and sign in
sends you to the dashboard. The position is the point: a client side guard has to render
the account first and navigate away afterwards, which shows somebody a balance they never
signed in to see for as long as it takes React to mount.

The matcher names `/` and `/dashboard/:path*` rather than using the documented catch all
with a negative pattern. Cheaper, and it cannot swallow an asset or an API route by
accident. The Flutterwave webhook in particular arrives with no cookie and must never be
answered with a redirect to a login form.

Confirmed rather than assumed: `/api/rates` answers 200 with live data and no cookie in the
jar. That is the check that matters for `npm run e2e` and for the Flutterwave webhook, both
of which arrive without one and would break silently if the matcher were drawn any wider.

**The session moved from sessionStorage to a cookie**, because the proxy runs before any
client code exists and sessionStorage is invisible there. The cookie name and its parser
live in `src/lib/demo-session.ts`, which carries no client directive and can therefore be
imported by both the form and the proxy. One definition of the format, two readers.
"Remember me" now decides the lifetime, thirty days against the tab, rather than being a
control that did nothing.

**None of this is a security boundary and the code says so three times.** The cookie is
unsigned, not HttpOnly, and any visitor could write one from the console. It stops somebody
skipping the front door, not somebody determined to get past it. The protection this
project actually needs is on the routes that move money, and those authenticate against
Pollar and the Flutterwave webhook signature rather than against anything here.

**A door that only opens inwards is not a door**, so the dashboard header carries a sign
out beside the notifications bell. Clearing the cookie is the whole of signing out, because
the cookie is the whole of the session.

**Then Back broke it.** Signing out and pressing Back put the account back on screen with
no cookie in the jar. The client router had restored the dashboard from its own cache
without asking the server, so the gate was never consulted, and the browser's back forward
cache does the same thing one layer lower. Found by pressing the button, not by reading the
code.

`DemoSessionGuard` wraps the dashboard and re-reads the cookie on mount and on `pageshow`.
Two events because they cover different cases: mount catches a client side navigation where
React rebuilds the page, `pageshow` catches a document revived from the back forward cache
where nothing remounts at all. It is optimistic on purpose, drawing the account and
withdrawing it rather than holding every honest load behind an effect to catch a case that
only happens on the way out.

**One false alarm worth recording.** The first run after the fix still showed the dashboard
on Back, which looked like the fix not working. It was a stale dev compile. Re-running the
whole sequence against recompiled output passed. The lesson is narrow and practical: in dev,
confirm the code under test is the code being served before concluding anything about it.

### Phase U2, the brand panel became glass

Requested: drop the black gradient for a glassy blur, centre the mark and the words, and
take 40 percent off the size.

The first two are straightforward. The panel centres on both axes and the block is centred
within it. The mark goes 88 to 53, the headline 42 to 25, both exactly 60 percent of what
they were. The paragraph stops at 13 rather than 9, because 60 percent of 15 is a size you
can measure but not read.

The gradient was doing work that the blur does not, and this is the part worth recording.
Two stacked black layers, a flat tint under a gradient weighted to the bottom, is the right
answer when type sits in a corner over a photograph. It is the wrong answer for a centred
block, since the gradient would be lightest exactly where the words now are. Blur removes
the local contrast that fights small white type without pretending the footage is not
there, which is what was asked for, but a blurred bright wall is still a bright wall.

**So the tint was measured rather than picked.** Sampling the frame behind the paragraph at
ten points across the 27 second clip, the footage averages 63 at its darkest and 188 at its
brightest as it settles on a lit wall. At a 40 percent tint the worst frame put 13px type
at 3.3 to 1, under the 4.5 that small text needs. At 55 percent, with the paragraph raised
from 60 to 75 percent white, the same ten frames read 5.0 to 10.0.

Re-measured live after the change: 5.03 at the brightest frame. Also checked what the glass
costs, since backdrop-filter recomposites over every video frame: 61fps, worst frame 17.2ms,
which is one frame at 60Hz and no dropped frames across the 120 sampled.

### Phase U3, the glass became a card and the copy became ours

Requested: blur only what the words stand on rather than the whole panel, put the left
alignment back, add 15 percent to the sizes, and rewrite the copy, which read as written by
a machine and was about Pollar rather than about us.

**The full bleed blur was the wrong instrument.** Softening the entire left half throws away
the footage it was there to show, since a blurred room is a grey field with a lamp in it.
The pane is now the size of the words. backdrop-filter clips to its element, so the rounded
corners cut the blur along with the tint and the result reads as a physical pane rather than
a rectangle of fog.

It also measures better. The card sits over a part of the frame that stays darker than the
panel average, so the paragraph reads 6.09 at the brightest frame against 5.03 for the full
bleed version, and 60.3fps with a smaller area to recomposite.

The border is not decoration. Against the dark half of the clip the card and the footage sit
close enough in value that the pane has no visible edge without it.

**Sizes went up 15 percent**, mark 53 to 61, headline 25 to 29, paragraph 13 to 15, with the
gaps moving with the type so the block scales rather than loosens. Net against the original
panel: 70 percent of where it started rather than 60.

**The copy.** What was there described Pollar's coverage and then named KORA as the gap in
it, which is an accurate framing of the thesis and a strange thing to say on your own front
door. It now says what we do in the order somebody would say it out loud: we move money out
of Africa, you type what you want to send, we price it live, it settles on Stellar for
Pollar to pay out. Every clause is something the app does, checked against the README's own
real and not real table rather than written to sound good. The fiat leg is deliberately not
mentioned, because on testnet it is simulated and a brand panel is exactly the wrong place
to be imprecise about that.

### Phase U4, the card became a band

Requested: blur a wide band rather than a small card, blend its edges out, make it look
smooth and premium.

**The card was the right size and the wrong object.** A hard rectangle with a border reads
as a component dropped on a photograph. The glass is now a wide pane across the panel that
fades out along its top and bottom rather than ending, so nothing about it says where it
stops. The sharp footage survives at both ends, which is what narrowing the blur was for.

**The fade is a mask, not a gradient.** This is the part that would be easy to get wrong. A
gradient of black over the band would darken what it was fading, so the band would lose its
tint while keeping its blur and the edge would read as a smear. A mask takes the whole layer
out together, tint and blur at the same rate, and the footage comes back into focus. The
ramps are long on purpose, 18 percent of the panel at the top and 14 at the bottom, because
a two or three percent feather still registers as a line.

Both spellings of the property are set. Safari still wants the prefix, and an unprefixed
mask alone would mean a hard edged band there rather than a missing effect. Confirmed
applied by reading the computed style back rather than by looking at it.

**Blur 40 to 64, tint 55 to 50.** At 40 the lamp and the pen holder are still readable
through the band, which looks like a photograph gone soft rather than glass. The lighter
tint was affordable because the band sits over a darker part of the frame: sweeping four
tints across the same ten frames, 45 percent fails at 4.83 and 50 passes at 5.37, with the
headline at 8.01.

Cost of the heavier blur, measured: 60.1fps, p95 frame 17.2ms, worst 17.6ms, no dropped
frames across 100. One note for whoever measures next, the rAF sampling silently returns
nothing when the browser pane is hidden, since a hidden document does not animate. A run
that comes back with four frames is a hidden window, not a stalled page.

### Phase U5, the glass runs off the bottom

Requested: extend the band further down and fade it progressively upward.

The band cleared both edges of the panel, which is what made it an object with a top and a
bottom. It now meets the bottom of the frame at full strength and thins out on the way up,
one ramp rather than two, so the only soft edge is the one nobody is looking at. It suits
the footage: the weight of the clip is in the lower half where the hands and the money are,
and that is also where the panel meets the fold on a short window.

**26 percent is not a round number and should not be tidied into one.** The block is
vertically centred, which puts its top between 31 and 34 percent of the panel across the
window heights the panel is drawn at, so the ramp finishes five to eight points above the
mark and no part of the type is sitting in a mask that is still fading. Tightened any
further and the paragraph would start losing its background on the bright frames only. That
is a fault a screenshot cannot catch, which is why it is written down rather than left to
whoever next thinks the number looks arbitrary.

Contrast improved as a result, worst frame 5.57 against 5.37, since the type now sits under
the fully opaque part of the mask rather than inside a plateau between two ramps.

Frame timing was not re-run for this change: the element, the blur radius and the area are
unchanged, only the mask stops moved, and the attempt returned zero frames because the pane
was hidden. Recorded as not run rather than inferred.

### Phase U6, the blur halved, and the measurement was wrong all along

Requested: the blur is too thick, halve it. 64 to 32, and an arbitrary value rather than a
step on the scale, since the scale goes 24 then 40.

**Thinning the blur costs contrast**, which is obvious once stated and was not caught until
it was measured. Less smoothing leaves a higher peak behind the type, 200 against 181, and
the paragraph fell to 4.10 against the 4.5 it needs. Two ways out: a 60 percent tint fixes
it at 5.33 and darkens the glass, which is the opposite of what thinning the blur was for,
or 90 percent white on the paragraph fixes it at 5.08 and leaves the room showing through.
The second is the one taken.

**The correction that matters for anybody reading the earlier entries.** Every contrast
number in phases U2 through U5 was the average of the frame behind the paragraph. Type does
not sit on an average. One bright patch under one line is a failure the mean hides, and that
is exactly what was happening: the mean said 5.57 while a patch at the right hand end of the
first line, at 18.4 seconds into the clip, was sitting at 3.7.

Re-measured properly, the 64px band read 4.64 per pixel. It passed, but by a quarter of a
point rather than the margin the old numbers implied.

The method now is: draw the frame into a canvas with the same blur radius the panel actually
uses, composite the tint, and take the minimum across every sampled pixel in the text box
rather than the mean. 84,096 samples across 12 frames. Approximating the blur by
downsampling into blocks was tried first and is not good enough either, since a box average
over 32px blocks and a Gaussian of radius 32 do not have the same peaks.

---

### Phase V, Kora Agent got a face and a resting state

Requested: polish the Kora Agent panel, using the supplied artwork as its logo.

**The sparkle was the problem, not the styling.** The panel identified itself with a
lucide sparkle in a black rounded square. That glyph is the house mark for "a model is
behind this" across the whole category, so it identified the feature and not this feature.
The supplied artwork is a portrait, and the app already draws every counterparty as a
portrait. Putting the agent in that slot says it is another party to the transaction,
which is the claim the panel then spends the rest of its height qualifying.

**The crop was measured, not chosen.** Nine candidate squares were rendered at 32 pixels,
the size the panel header draws, then magnified with nearest neighbour so the pixels could
be counted. Anything wider than about 580 loses the face entirely: the head becomes one
element in a composition and the tile reads as an abstract pattern. Anything tighter than
about 460 keeps the face and throws away the floral crown, which is the memorable half.
540 square from (240, 110) is the smallest crop where the sunglasses, the profile and the
crown are all still separable at 32 pixels.

**Palette PNG, and the reason is the repository rather than the wire.** Truecolour is
491 KB for an image drawn at 44 pixels. Quantised it is 123 KB, and the two were rendered
side by side at 180 and at 56 with nothing to choose between them: the artwork is flat
vector shapes with one soft gradient across the skin, which is close to the best case for
quantisation. `next/image` re-encodes to AVIF or WebP at the requested size either way, so
this never affected what the browser downloads.

Two facts about the source file are in the script header because both would waste
somebody's afternoon. It is named `.png` and `sharp` reports it as WebP. Its background is
rgb(226, 206, 188), a warm beige, deliberately not keyed out: keying it would cut a hard
silhouette through the floral crown, where the artwork's own shapes sit on the background
at low contrast and there is no edge to find.

**Not the `Avatar` component.** That one is keyed by a file stem in `public/avatars` with a
monogram behind it, so a missing file falls back to the initials "KA" in a filled disc,
which reads as a person nobody can name. The agent has exactly one portrait and is not in
the beneficiary book.

**Not the rail either.** The rail keeps its sparkle. Rail buttons invert to a black fill
with a paper-white icon when active, and a photograph cannot invert, so the portrait would
have had to sit in a black square that was otherwise the selected state. That is a worse
object than the glyph it replaced.

**The name was being printed twice.** `PanelFrame` prints "Kora Agent" and the header below
it printed the same two words again, so the first thing anybody read on opening the panel
was a repetition. The portrait carries the identity now, and the line beside it says what
the agent does and what it will not do.

**Two thirds of the column was empty.** It now carries the five slots the parser fills,
drawn as the same five rows the result table prints. That does two jobs: it teaches the
input, which "say it, do not fill it in" does not, and it means the result arrives in a
frame the reader has already seen rather than a structure that appears from nowhere.

The one duplication in the panel is that list. `AGENT_SLOTS` is not derived from a parsed
response, because it has to exist before there is a response to derive it from. It is
commented as such: add a `Slot` row, add it there.

**The boundary note moved into the resting state.** The claim that matters most, that the
agent holds no signer, was only rendered after a parse, which is to say it was invisible
until somebody had already used the thing. The note after a parse is now about that parse
rather than a repeat of the same sentence.

### Phase V2, the destination was printing as a field name

Found while testing the panel rather than looked for. The Understood as table read
"Destination: BO" and the corridor note read "settling in BO via Pollar". The person typed
"Bolivia" and got an ISO code back.

The code is the right thing to carry between the parser and the corridor engine and the
wrong thing to render. The resolver returns the name beside it now.

**The set of Pollar destinations is derived rather than listed.** It was a hand-written
`Set(['BO', 'BR', 'CO', 'MX'])` sitting a few files away from `POLLAR_CORRIDORS`, the table
it had been copied out of. Two places to update when Pollar adds a ramp, and one of them
with nothing to remind you. It is now a Map built from that table, which also means the
name comes for free instead of needing a second country table in the browser.

Everything downstream still uses the code. Only what is rendered changed.

**Gemini is confirmed live.** Known gap 2 said the model name `gemini-2.5-flash` was an
assumption until a real request proved it. Two sentences were parsed through the panel and
both came back labelled "Gemini and rules", which is the badge the panel only draws when
`source === 'gemini'`. The gap is closed.

### Phase W, scheduled payments

Requested: the agentic workflow. Earn was suspended mid-task and is not built.

**The one decision everything follows from: the naira leaves when the payment is
scheduled, not when it is sent.**

Debiting at due time is simpler and wrong. A balance that still shows money already
promised to somebody is a balance you can spend twice, and the second spend does not fail
at the point of spending. It fails on Friday, when the scheduled payment cannot cover
itself. Reserving up front means the figure on the card is money you can actually use, and
a scheduled payment can only fail for reasons outside the account.

So a scheduled payment is not a note about the future. It is a debit that has already
happened with a delivery still owed, which is why cancelling one writes a credit rather
than deleting a row.

**A send is now two halves.** They have had the same lifetime only because nothing could
hold one yet:

    reserve   quote, check the balance, check the float, debit
    settle    provision the wallet, deliver the USDC, price the last mile

For an immediate send those are a millisecond apart. For one due on Friday they are days
apart, and the second half has to run with no request, no session and nobody watching.
`settle` moved to `lib/payments` and both callers use it.

The contract that makes it safe to call unattended: every failure path inside `settle`
reverses the debit before returning, so `ok: false` always means the account is already
whole. A runner that has to remember to clean up after itself is a runner that eventually
will not.

**The float is checked twice and those are two different checks.** The one in
`/api/payments` runs before the debit and refuses cleanly, writing nothing. The one inside
`settle` runs after, because a payment reserved on Monday cannot pre-flight Friday's float
and has to reverse instead. `/api/schedule` does not check it at all: refusing to book
Friday's payment against Wednesday's float is refusing for a reason that will not be true
when it matters.

**The quote is taken inside `settle` rather than passed in.** A payment scheduled on
Monday for Friday is worth what Friday says it is worth. Carrying Monday's number forward
would be the one invented figure in a corridor built to be honest about exactly this. The
review screen says so in as many words.

**Compare and set, after getting it wrong once.** The store's first guard was "only a held
payment may move", which is correct for cancelling and useless for the runner: it claims a
payment by moving it out of `held`, and then could not write the outcome because by then
it was not held. The fix was `transition(ref, from, to, outcome)`, which does nothing and
returns null unless the payment is in the state the caller named. One mechanism, three
hazards:

    held    to cancelled   a second click cancels nothing
    held    to failed      the runner claims a payment exactly once
    failed  to sent        only the runner holding the claim may record

The alternative was a documented bypass on the store interface, and a store interface with
a way around its own guard has no guard.

**The runner claims as failed and corrects to sent.** If the process dies between the
claim and the outcome, what is left says the payment did not go. That is the safer of the
two wrong answers to leave in a database, because it is the one somebody checks.

**Sequential, not `Promise.all`.** Every payment spends from one treasury float and
provisions through one upstream. Four at once is four concurrent claims on a balance that
was checked against one of them, and the float check only means anything if they take
turns.

**There is no cron, and the panel says so.** The dashboard is the scheduler: it asks once
on load and then every minute while it is open. A payment due overnight goes out when
somebody next opens the page, and an overdue row reads "Due now, sends on the next check"
rather than printing a time that has passed as though it were missed. Turning this into a
real cron is one Vercel entry pointed at `/api/schedule/run`. What is not free is
correctness with two runners at once, which is the open hazard below.

The hook is mounted on the dashboard rather than inside the panel. A payment due at nine
has to go out at nine whether or not anybody is looking at the list of payments that have
not gone out.

**POST for the runner despite an empty body.** It spends money, and a GET that settles
payments is one a prefetcher, a link preview or an address bar can fire.

**The loop that had been open since the first commit.** `timing` and `scheduledFor` have
come out of the parser from the beginning and nothing has ever read them, so "pay Carlos
on Friday" produced a form that would have sent it immediately. The agent now passes the
date into the send draft, and only when it is still ahead: a model reading "Friday" on a
Saturday can hand back a Friday that has gone, and the form would then open on a schedule
it cannot book.

**Scheduling has its own finished state**, not the receipt with the hash blanked out. The
sent screen's whole argument is the Stellar transaction, and none of that exists yet for a
payment due on Friday. Rendering the same layout with the proof missing would read as a
send that half worked.

### Phase W2, two things found by testing rather than by looking

**A raw timestamp in the activity feed.** The ledger entry for a held payment read "Due
2026-09-18T10:58:34.345Z." That is the same mistake as the ISO country code in phase V2,
in a different place: a machine instant is the right thing to store and the wrong thing to
show. It is formatted now and names UTC, because the string is built on a server whose
timezone is not the reader's and quietly using the server's local time would print a
number that is wrong for almost everybody and looks right to all of them.

**An invalid label.** The When block was put inside `Field`, which wraps its children in a
`<label>`. A label names one control, so a label containing a radiogroup and a datetime
input names the first thing it finds and silently mislabels the rest. It is a plain span
now and each control carries its own name. The amount input gained an explicit one too.

### Phase W3, Pollar Earn, probed and then suspended

Earn was in scope for about an hour and the probe is worth keeping even though the feature
is not being built, because the finding is about the whole Pollar integration rather than
about Earn.

`@pollar/core@0.11.3` ships four real Earn endpoints: `/earn/providers`,
`/earn/opportunities`, `/earn/position` and `/earn/build`, with Blend and DeFindex behind
them.

**The first probe run was worthless and read as conclusive**, which is the worse of the two
failure modes. A script has no origin, so `fetch` from Node sends no `Origin` header, and
Pollar answers a request with no origin exactly as it answers one from an origin that is
not on the list: 403 `ORIGIN_NOT_ALLOWED`. That was read as an empty Domains list.

With `Origin: http://localhost:3000` the same call answers 401 `SDK_AUTH_INVALID_TOKEN`.
Completely different fact. **The origin is accepted and always has been**; Earn wants a
signed in Pollar user, not just the publishable key. `/applications/config` answers 200 on
the same header, and the e2e run's own `domains` check agrees.

Two more results worth not rediscovering: `https://localhost:3000` and
`http://127.0.0.1:3000` are both 403. The Domains entry is matched character for
character.

The server door answers 404 on every Earn path, so Earn is SDK only and cannot be reached
from a route handler the way the beneficiary wallet provisioning is.

`npm run probe:earn` is kept. Nothing in the app imports it.

### Phase X, the runner got a secret and a real scheduler

Requested: can the VPS drive this.

Yes, and it is the better answer rather than a workaround. The finding that made it worth
doing properly is that the open endpoint was a problem on its own.

**`POST /api/schedule/run` had no authentication.** It settles every payment that has
fallen due. It cannot send money that was not already scheduled and reserved, so it was
never a way to drain the treasury, but it did let anyone who found the path decide *when*
payments fire. On localhost that is nothing. Deployed, it is a stranger holding the clock.

**It takes a shared secret now, and that has a second consequence worth more than the
first.** A browser cannot hold a secret: anything prefixed `NEXT_PUBLIC_` ships to every
visitor in the bundle, and the demo session cookie is unsigned and not HttpOnly by
`lib/demo-session`'s own documentation, so accepting it here would have been a lock with
the key taped to it. The dashboard therefore loses the ability to trigger payments at all.

**Which means a configured deployment has exactly one runner.** That is the fix for the
duplicate-delivery hazard in the Redis store rather than a workaround for it. The unlocked
read, check, write can only go wrong with two runners firing at once. One timer on one
host, wrapped in `flock -n`, makes that unreachable rather than merely unlikely. It is a
better fix than the Lua script the store's own comment proposes, and it is cheaper.

**Vercel Cron would not have given that.** It does not promise exactly-once: a retry or an
overlapping invocation is two callers, which is precisely the case the store cannot
survive. A VPS timer is the safer host here, which is not the usual direction for that
comparison.

**Two modes, and the server decides which.** With no secret the route is open and the
dashboard drives it, which is the development default. `GET /api/schedule` reports
`runner: 'cron' | 'dashboard'` and the panel renders whichever is live.

The wording is "a scheduler is expected", not "a scheduler is running". If the secret is
set and nobody wired the timer up, payments sit held, and the server has no way to tell
that from a healthy cron. Claiming otherwise would be inventing a fact about
infrastructure.

**The browser stops polling in cron mode** rather than firing a request every sixty
seconds whose only possible outcome is a 401 in the console for the length of a demo. The
flag lives in a ref, not in state, so the polling effect does not tear down and rebuild
its interval every time the list changes.

**Small things that are easy to get wrong.** Comparison is `timingSafeEqual` with the
length check folded in rather than returning early, because an early return on length is
itself an oracle. A secret containing `replace-me` is treated as absent, the same rule
`hasServerKey` applies to the Pollar key: a deployment that copied `.env.example` verbatim
has a password every reader of the repository knows. A header sent to an unconfigured
deployment is refused rather than waved through, because "auth is optional" is how every
optional auth check has ever failed.

The route answers 401 by hand rather than through `fail`, which returns 400 for
everything. A cron that gets 400 looks like it sent malformed input, and whoever set it up
goes looking at the wrong thing.

**`scripts/kora-runner.sh` is the VPS side.** `flock -n` so a slow settlement cannot pile
up callers, `--fail-with-body` so a 401 prints its reason instead of leaving `curl exit 22`
as the only clue, and silent unless something moved, because a minute-by-minute log of
"due 0" buries the one line that matters. Both cron and systemd units are in its header.
`Persistent=true` is deliberately absent from the timer: a missed minute must not queue and
fire a burst of catch-up runs after a reboot, and the next tick collects everything due
anyway.

### Phase X2, the co-author lines

`AGENTS.md` says never to add a co-author to commits. Twenty-eight commits carried
`Co-Authored-By: Claude`, added against that instruction because a harness reminder
supplied the lines and was followed over the project's own rule. The reminder itself defers
to `AGENTS.md`, so there was never a conflict to resolve.

Twenty-six of them were unpushed and have been rewritten with `git filter-branch
--msg-filter` over `origin/main..HEAD`. `git diff backup-before-coauthor-strip HEAD` is
empty: messages changed, no file content did. The backup branch is
`backup-before-coauthor-strip`, and deleting it is safe once the history looks right.

**Two are still on GitHub** and still carry the line: `729cf5a` and `60e32fb`, the current
`origin/main`. Removing those needs a force-push, which is not something to do to somebody
else's remote without being asked.

### Phase Y, the VPS scheduler, and three faults it exposed

The runner was installed on a Contabo VPS against the Vercel deployment. It did not work
first time, three times over, and each failure was worth more than the setup.

**Fault one: the runner logged eight kilobytes of HTML a minute.** The deployment predated
the route, Next.js served its own 404 page, and `--fail-with-body` printed all of it.
systemd wrote every byte to the journal once a minute. The useful fact, "404", was buried
in markup, and a host left running overnight would have filled its disk with copies of an
error page. An HTML body is now described rather than reproduced, and anything else is
capped at 400 characters.

**Fault two: curl's exit code is not a fact about the response.** `--retry` and
`--fail-with-body` interact. For the same 404 against the same URL, curl 8.5.0 on Ubuntu
returned 22 and the curl in Git Bash returned 0. The script branched on that, so the same
error was a failure on one machine and a success on the other.

`--fail-with-body` is gone. Without it curl exits 0 for any response it managed to receive
and `%{http_code}` says what happened, which leaves curl's exit code meaning only that the
request never completed. Non-2xx is a failure whatever curl thought. 404 and 401 carry a
named hint, because a status code alone sends people to the wrong place: 404 here is a
deployment that predates the route, which is a redeploy and not a credential problem.

**Fault three: the file reached the VPS with CRLF endings.** `/usr/bin/env: 'bash\\r': No
such file or directory`, which names bash and sends the reader to bash.

`.gitattributes` was added earlier in the session for exactly this, and it worked: Git's
stored blob has zero carriage returns. It did not help, because the file was copied from
the working tree rather than from Git, and the working tree had CRLF. Python's `open` in
text mode translates `\\n` to `\\r\\n` on Windows, so every edit made to that script through
a Python rewrite reintroduced them.

Worth remembering rather than just fixed: `.gitattributes` governs what Git stores and
what a fresh checkout produces. It does nothing about a file a tool wrote after checkout.
`git checkout -- <file>` after a rewrite restores the declared endings, and
`tr -cd '\\r' < file | wc -c` answers the question in one command.

**The sequence that proved it, from the journal:**

```
13:32:51  status 127                      not runnable
13:33:53  /usr/bin/env: 'bash\\r'          CRLF
13:34:56  FAILED http 401 + hint          runs, route exists, secret missing
```

404 becoming 401 is the load bearing line. That status is only reachable once
`/api/schedule/run` exists, so it is the proof the deployment carries the scheduling work.

**What is deployed and what is not.** All 29 commits are on
`github.com/MikeMoulder/kora`, the deployment serves the schedule routes, the VPS timer is
installed and firing every minute, and the script's diagnostics are readable. The one
remaining step is `KORA_RUNNER_SECRET` in Vercel's environment. Until it is set the run
route is open to the internet and `GET /api/schedule` reports `runner: 'dashboard'`.

## Known gaps, stated plainly

1. ~~**The Pollar hand-off has never run.**~~ Closed. It has run many times since, most
   recently by the scheduled runner with nobody watching. The dashboard setting it was
   thought to be blocked on was never the problem: phase W3 shows the origin was on the
   allowed list the whole time and the probe that said otherwise was not sending an
   Origin header.
2. ~~**Gemini has never been called.**~~ Closed 2026-09-18. Two sentences were parsed
   through the agent panel and both came back labelled "Gemini and rules", which is the
   badge the panel only draws when the response says `source === 'gemini'`. The model
   name `gemini-2.5-flash` is confirmed, not assumed.
3. **Next.js 16 docs were not read before writing code**, which AGENTS.md asks for. The
   build and typecheck are clean, but that is not the same as being correct. Phase G covers
   the audit.
4. ~~**Nothing is deployed.**~~ Closed 2026-09-18. All 29 commits are on
   `github.com/MikeMoulder/kora` and the deployment serves the scheduling routes: the VPS
   runner's 404 became a 401, which is only reachable once `/api/schedule/run` exists.
   What remains is `KORA_RUNNER_SECRET` in Vercel's environment, without which the run
   route is open to the internet and the VPS timer cannot authenticate.
5. **Existing project docs contain em-dashes.** The preference was noted after they were
   written. Phase K6 covers the cleanup.
6. ~~**The operator console is visually broken.**~~ Not a gap any more. The console was
   retired in 5ad3e3a and there is no unconverted screen left. Only two comments mention
   it, both correctly in the past tense.
7. **The panel video is 15.7 MB and cannot be compressed here**, since there is no ffmpeg
   on this machine. The sign in panel layers it over a finished composition so the page
   never depends on it arriving.
