# KORA — submission material

Copy for the Boundless submission form, plus the demo script.

---

## One-liner

**KORA is the African corridor provider Pollar doesn't have — written to Pollar's own
adapter contract.**

---

## Short description (≈ 80 words)

Pollar ramps fiat into Brazil, Colombia, Mexico and Bolivia. Its rail enum ships as
`SPEI | PIX | PSE | ACH | BREB | QR` — six rails, all Latin American. Africa is absent from
the type system.

KORA fills that gap. A Nigerian freelancer types one sentence, funds through NIP or M-Pesa,
and the value hands off to Pollar as USDC on Stellar. Adapters emit Pollar's own
`depositInstructions` shape, so one renderer serves both registries. Corridors we cannot
execute refuse to run.

---

## Longer description (≈ 220 words)

The flagship challenge asks for the African leg of an Africa ↔ Latin America corridor. We
read that literally and asked what shape the answer should take. Pollar's operator docs
define the unit of a ramp — *direction + country + fiat + rail + the on-chain asset* — and
hold the dashboard to a rule: it can never enable a route with no code behind it.

So KORA is not an app sitting beside Pollar. It is a corridor provider written to that
model, in that vocabulary, under that rule.

Three things follow.

**The hand-off is native.** Our adapters return Pollar's `RampDepositInstructions` shape —
labelled, typed, provider-agnostic fields plus an optional scannable. The same component
renders a Pollar ramp and a Nigerian bank transfer without knowing which produced it. The
test suite asserts this against Pollar's actual key and type enums.

**Honesty is structural.** Corridors declare `live`, `sandbox` or `planned`. Planned ones
throw `CorridorNotExecutable` — you cannot click past them — and each names its real
blocker: an MTN partner agreement, a sponsoring bank for PayShap, a Bank of Uganda licence.

**The AI cannot move money.** A deterministic parser runs first and the model may not
overrule a number it could already read. The model fills an object; code decides what can
happen.

The Bolivian payout is simulated. That is Pollar's mainnet leg, and the brief said not to
build it.

---

## Demo script — 3 minutes

**0:00 — The gap.** Open `/corridors`.

> "This is Pollar's rail enum, straight out of `@pollar/core` 0.11.3. SPEI, PIX, PSE, ACH,
> BreB, QR. Six rails. Mexico, Brazil, Colombia, Bolivia. Now look at the African column."

Point at the zero.

> "That's the whole brief in one number. So we didn't build an app next to Pollar — we built
> the corridor provider it's missing, against its own contract."

**0:35 — One sentence.** Back to `/`. Type:

> `Send ₦100,000 to Carlos in Bolivia for his logo design.`

> "A parser fills a payment intent. Notice it says which parser — rules, or rules plus
> Gemini. And the model is not allowed to overrule the amount. That field is where a
> confident hallucination costs someone money, and it's exactly what a regex is good at."

**1:05 — The quote.**

> "Live mid-market rate, attributed to its source. Rail fee and our spread itemised
> separately. No markup hidden in the rate — that's the whole line item, and you can see it."

**1:25 — The African leg.** Click through to funding.

> "Bank, account, and a reference the corridor enforces. These fields come back from our
> adapter in Pollar's own `depositInstructions` shape — so this screen would render a Pollar
> ramp identically. That's what 'native hand-off' means here."

Click **I've sent the transfer**.

> "Reporting a transfer is a claim, not a settlement. They're different states, because in a
> real corridor they're different events."

**1:55 — The operator desk.** Open `/operator` in a second tab.

> "NIP has no callback, so a human matches the statement against the reference. Every real
> African collections operation has this desk. We made it a screen instead of a hidden timer."

Confirm receipt. Watch the first tab advance.

**2:20 — The hand-off.**

> "Amber was ours. Cyan is Pollar's. Sign in — Pollar creates the Stellar wallet, key in KMS,
> no seed phrase. And the transfer is sponsored, so the user pays zero XLM."

Send. Show the hash.

**2:45 — The passport.**

> "Everything above the hash is verifiable on a public network. The Bolivian payout is the one
> step we simulate — it's Pollar's mainnet leg via Stereum, and we were told not to build it.
> So we didn't, and we labelled it."

---

## Anticipated judge questions

**"How much of this is real?"**
The README opens with a table that answers exactly this, line by line. The African fiat leg
is simulated; so is Pollar's own on testnet. The Stellar transfer is real and has a hash.

**"Why not just use `<RampWidget>`?"**
Because there is no African ramp behind it. The widget renders corridors Pollar's backend can
execute, and Africa isn't among them. Building the missing provider was the assignment.

**"Isn't 'planned' just a label?"**
No — `plannedAdapter` throws on every verb, and `npm run smoke` asserts it. Try quoting
`GH.GHS.MOMO.onramp`.

**"What would it take to go live?"**
A licensed Nigerian collections partner for NIP; an approved Safaricom shortcode for M-Pesa.
Both are commercial, not technical. The README lists all five with their specific blocker.

**"Where's x402?"**
Not in the shipped SDK. The blurb mentions it; `@pollar/core@0.11.3` and the docs don't. We
left it out rather than claim it.

---

## Links

- Live: _(Vercel URL)_
- Repo: _(GitHub URL)_
- Settlement account: https://stellar.expert/explorer/testnet/account/GAEHDX7IXJHG2UUCCUES63C7WBLPXJX6IHTA6TGENHDJBSZ65AB7FWQE
