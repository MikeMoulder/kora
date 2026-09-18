# KORA

**The African corridor Pollar doesn't have.**

Pollar's ramp registry covers Brazil, Colombia, Mexico and Bolivia. Its rail enum — shipped
in `@pollar/core@0.11.3` — is `SPEI | PIX | PSE | ACH | BREB | QR`. Six rails, every one of
them Latin American. There is no African rail in the type system, and no African corridor in
the registry.

KORA is that corridor, written to Pollar's own adapter contract rather than bolted on beside
it. A Nigerian freelancer types one sentence, funds through a rail they already use, and the
value hands off to Pollar as USDC on Stellar. Pollar lands it in Bolivia.

```
🇳🇬 NGN ──▶ NIP bank transfer ──▶ USDC ══▶ POLLAR ══▶ BOB 🇧🇴
   └────────── KORA's leg ──────────┘  └─ Pollar's leg ─┘
```

---

## What is real and what is not

The single most important table in this README. Nothing below is rounded in our favour.

| Step | Status | Why |
| --- | --- | --- |
| Natural-language → payment intent | **Real** | Deterministic parser + Gemini, merged under a fixed policy |
| Corridor resolution and limits | **Real** | Against a live registry; unroutable requests are refused |
| FX rate and fee breakdown | **Real** | Fetched live, attributed to source and timestamp |
| Funding request, reference, lifecycle | **Real** | Full state machine, reference enforced |
| NGN / KES leaving a real bank | **Simulated** | Needs a licensed collections partner — a commercial agreement, not code |
| Hand-off transfer on Stellar | **Real** | Sponsored on-chain transaction, hash verifiable on stellar.expert |
| BOB payout in Bolivia | **Simulated** | Pollar's mainnet leg via Stereum. The brief said not to build it |

On **testnet no fiat leg is live for anyone** — Pollar's own SEP-24 fiat deposit is marked
`coming soon` in its example-app matrix. A simulated African fiat leg is not us cutting a
corner; it is the ceiling testnet imposes on both ends of the corridor.

---

## The idea, stated precisely

Pollar defines the unit of a ramp in its operator docs:

> "The real unit of a ramp is the **corridor**: direction + country + fiat + rail + the
> on-chain asset the user ends up with. Corridors are seeded from what the backend can
> actually execute … so the dashboard can never enable a route with no code behind it."

KORA adopts both halves of that — the data model *and* the rule.

**The model.** A `KoraCorridor` carries direction, country, fiat, rail and asset, and
`KoraRail` extends Pollar's enum rather than replacing it. Adapters emit Pollar's own
`RampDepositInstructions` shape: labelled, typed, provider-agnostic fields plus an optional
scannable. The result is that one component renders a Pollar ramp and a KORA rail without
knowing which produced it — see [`src/lib/corridor/pollar-shapes.ts`](src/lib/corridor/pollar-shapes.ts).

**The rule.** Every corridor declares a `readiness`, and the honesty is structural rather
than cosmetic:

- `live` — executes end to end against a real dependency. *Nothing claims this yet.*
- `sandbox` — full state machine, simulated settlement. Nigeria NIP, Kenya M-Pesa.
- `planned` — declared and typed, **no execution path**. Every verb throws
  `CorridorNotExecutable`.

So "Coming soon" is not a label someone remembered to add. A planned corridor physically
cannot produce a quote, and the smoke test asserts it. Each one also names its actual
blocker — an MTN partner agreement, a sponsoring bank for PayShap, a Bank of Uganda licence
— instead of saying "coming soon".

---

## How the AI is constrained

The split that matters: **a model decides what the sentence means; deterministic code
decides what can happen.**

The rule parser ([`rules.ts`](src/lib/intent/rules.ts)) runs **first**. Gemini
([`gemini.ts`](src/lib/intent/gemini.ts)) then contributes under a merge policy that lives
in one auditable function:

```
amount, currency  → the rule parser wins whenever it found one
everything else   → the model wins when non-null, rules fill the gaps
```

The model may not overrule a number a regex could already read. Amount and currency are the
two fields where a confident hallucination costs the user money, and they are exactly the
two a regex handles well. The model earns its place on loose phrasing, relative dates and
purpose extraction.

Everything the model returns is then validated against the corridor registry in
[`resolve.ts`](src/lib/intent/resolve.ts). It cannot name a corridor that does not exist.
It is wired to no signer. And a payment still needs a human to confirm a reviewed quote.

If there is no `GEMINI_API_KEY`, or the call fails or times out, the rule parser's answer
stands and **the UI says which parser produced it**. There is no silent degradation.

---

## What we use from Pollar

| Pollar capability | Where | Why it mattered |
| --- | --- | --- |
| `PollarProvider` / `usePollar()` | [`providers.tsx`](src/app/providers.tsx), [`Handoff.tsx`](src/components/Handoff.tsx) | Session, wallet and transaction state |
| Social login → custodial wallet | `Handoff.tsx` | Stellar G-address created on sign-in, key in AWS KMS. No seed phrase for the user |
| `sendPayment()` | `Handoff.tsx` | The hand-off itself — a sponsored transfer where the user pays no XLM |
| Corridor / ramp model | [`pollar-shapes.ts`](src/lib/corridor/pollar-shapes.ts) | The contract KORA's adapters are written to |
| `RampDepositInstructions` | [`shared.ts`](src/lib/corridor/adapters/shared.ts) | Our funding screen is provider-agnostic because of it |

We deliberately did **not** ship `<WalletButton>` or `<RampWidget>` as-is. Pollar's own
guidance is that a good integration makes Pollar feel like infrastructure, and a wrapper
around its modals would have been a different, smaller project.

**`x402` is not in the shipped SDK.** The hackathon blurb mentions it; it appears nowhere in
`@pollar/core@0.11.3` or the docs. We left it out of the pitch rather than claim it.

---

## Run it

Requires Node 20+. We built on 22.18.

```bash
npm install
cp .env.example .env.local
npm run setup:settlement   # creates + funds a testnet account, opens a USDC trustline
```

Then add a publishable key from [dashboard.pollar.xyz](https://dashboard.pollar.xyz)
(Build → API Keys → Generate → publishable, testnet) to `.env.local`:

```
NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY=pub_testnet_…
```

```bash
npm run dev
```

Four dashboard settings are not optional, and each fails in its own way if you skip it:

| Dashboard | Setting | Skip it and… |
| --- | --- | --- |
| Build → **Domains** | Add `http://localhost:3000` | Every SDK call returns `ORIGIN_NOT_ALLOWED` (403) |
| Treasury → **Account Funding** | Fund the reserve wallet | New user wallets cannot meet the base reserve |
| Treasury → **Sponsorship** | Enable | The user pays their own XLM, which defeats the point |
| Treasury → **Tokens & Trustlines** | Add USDC | The transfer fails with `op_no_trust` |

Domains has no wildcards, so add each deployment URL separately.

If you cannot get testnet USDC, set `NEXT_PUBLIC_SETTLEMENT_ASSET=XLM` and the corridor
still runs against a real on-chain transfer; the UI names whichever asset actually moves.

> **Testnet keys are capped at 1,000 requests/day** and this SDK signs a DPoP proof per
> authenticated request. Worth knowing before you leave a polling loop running.

### Verify it without clicking anything

```bash
npm run smoke
```

Runs the whole African leg headless — parse, resolve, quote, fund, report, settle — plus the
negative cases. It asserts that planned corridors throw, that below-minimum amounts are
rejected, and that the fee breakdown reconciles to the USDC figure to within a cent.

34 checks, no browser and no keys required. A sample:

```
[  ok  ] Pollar has zero African corridors
[  ok  ] breakdown reconciles to the USDC figure — 74.7016198 vs 74.7016198
[  ok  ] reporting does not fund
[  ok  ] Kenya M-Pesa fields use only Pollar's key enum
[  ok  ] both adapters render from the same field vocabulary
[  ok  ] quoting GH.GHS.MOMO.onramp throws CorridorNotExecutable
```

The shape-parity block is the one worth reading. This project's central claim is that one
renderer serves every rail because every adapter emits Pollar's instruction shape — so the
test asserts it against Pollar's actual key and type enums rather than leaving it as prose.
It has already earned its keep: it caught a themed-SVG claim in our own code comment that
was false at the time.

---

## Layout

```
src/lib/corridor/
  pollar-shapes.ts     Pollar's ramp types, mirrored and cited
  types.ts             KoraCorridor, KoraRailAdapter, readiness
  registry.ts          The registry + Pollar's corridor table for comparison
  engine.ts            Rail-agnostic orchestration
  rates.ts             Live FX, attributed, with a pinned fallback
  adapters/
    nigeria-nip.ts     NIBSS instant transfer      (sandbox)
    kenya-mpesa.ts     M-Pesa STK push             (sandbox)
    planned.ts         Five corridors that refuse to run

src/lib/intent/        rules.ts → gemini.ts → resolve.ts
src/components/        Composer, RouteRail, Handoff, Passport
src/app/corridors/     The registry, side by side with Pollar's
```

Adding a country is adding an adapter. There is no branch on country or rail anywhere in the
engine or the UI.

---

## What would make the corridors live

Not more code, in most cases:

| Corridor | What it needs |
| --- | --- |
| Nigeria NIP | A licensed collections partner issuing per-payment virtual accounts |
| Kenya M-Pesa | An approved Safaricom shortcode and a reviewed Daraja callback URL |
| Ghana / Uganda MoMo | A local entity and a signed MTN partner agreement |
| South Africa PayShap | A sponsoring bank; SARB exchange control on the outbound leg |
| Nigeria P2P | An escrow contract and counterparty liquidity — deliberately not simulated, because a fake match would misrepresent the settlement risk that makes this rail hard |

---

## Design

Colour encodes ownership. **Amber is the leg KORA built. Cyan is the leg Pollar owns. Amber
warning tags mark anything simulated.** Someone who never reads this file should still be
able to point at the screen and say which half we are claiming.
