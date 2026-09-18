So when my agent gave me the idea.md, I sent a followup question from what I saw in the telegram group

Me: does this change anything?

The African leg is yours to build: how a user funds or cashes out through local rails (mobile money, bank transfer, P2P, agents) and gets connected to Pollar. A sandbox or a documented semi-manual flow is totally fine. We don't provide an Africa ramp; designing that path is the challenge.

The Bolivian leg is on Pollar's side: our BOB ramp runs on mainnet, so you don't need to build or integrate anything in Bolivia.

For the hackathon, build and demo on testnet (Pollar wallets, sponsored txs, USDC transfers) and mock the final BOB payout step. What we'll evaluate is that your African path exists, is well designed, and hands off cleanly to Pollar.

My AGENT: Yes bro. **This changes our implementation strategy quite a bit, but it actually makes KORA cleaner.**

The key clarification is:

> **We are NOT responsible for the Bolivia/BOB integration.**

Pollar already owns that leg. We need to prove:

**African user → African local rail → Pollar → USDC transfer → mocked BOB payout**

So I'd modify the concept slightly.

## The actual KORA architecture

```text
🇳🇬 AFRICA
    │
    │  OUR PRODUCT
    ▼
┌──────────────────────┐
│ African Funding Hub  │
│                      │
│ Bank Transfer        │
│ Mobile Money         │
│ P2P                  │
│ Cash Agent           │
└──────────┬───────────┘
           │
           ▼
       African
       funding
           │
           ▼
        USDC
           │
     ┌─────▼─────┐
     │  POLLAR   │
     │ TESTNET   │
     └─────┬─────┘
           │
           ▼
       USDC transfer
           │
           ▼
    ┌──────────────┐
    │ MOCK BOB     │
    │ PAYOUT       │
    │ 🇧🇴 Bolivia  │
    └──────────────┘
```

And this is actually **better for our hackathon story**, because now our differentiation is crystal clear:

### Pollar says:

"We can move the money on the infrastructure side."

### KORA says:

"Cool. But how does an African human actually get money into that system?"

**That's our product.**

---

# I would change one major thing

Previously I described KORA as:

> NGN → USDC → Pollar → BOB

I'd now position it as:

# **KORA: The African On-Ramp to Pollar**

with the broader vision:

> **The intent layer connecting African local money to global payment infrastructure.**

Because the hackathon literally says the African leg is the challenge.

---

# This makes our African Funding Hub the centerpiece

Instead of just having a dropdown saying:

> Nigeria → Bank Transfer

we should build a genuinely thoughtful **African funding experience**.

User says:

> "Send ₦100,000 to Carlos in Bolivia."

KORA responds:

### Fund your payment

**₦100,000 NGN**

Choose how you want to fund KORA:

### 🏦 Bank Transfer

Transfer NGN from your Nigerian bank.

**Estimated confirmation:** 1–5 min

### 👥 P2P

Buy/fund USDC through a verified local counterparty.

**Estimated confirmation:** 1–10 min

### 📱 Mobile Money

Use a supported mobile-money provider.

**Coming soon / sandbox**

### 🤝 Agent

Deposit cash with a KORA agent.

**Coming soon**

---

# But here's the creative part I'd add

## **KORA Local**

A dedicated African rail abstraction.

Instead of building one-off integrations into the main application, we create:

```text
African Rail Adapter
        │
        ├── Nigeria
        │     ├── Bank
        │     ├── P2P
        │     └── Agent
        │
        ├── Ghana
        │     ├── Mobile Money
        │     └── Bank
        │
        ├── Kenya
        │     └── Mobile Money
        │
        └── Uganda
              └── Mobile Money
```

Each rail eventually implements the same interface:

```text
getQuote()
createFundingRequest()
getFundingStatus()
confirmFunding()
```

Then KORA doesn't care **how** the African user funded it.

It simply receives:

```text
Funding confirmed
₦100,000
Nigeria
```

and hands off to Pollar.

---

# The handoff should be VERY visible

This is probably the most important thing to demonstrate to the judges.

We should literally have a UI state:

### **African leg**

```text
🇳🇬 Nigeria

₦100,000

✓ Funding method selected
✓ Funding initiated
✓ Funds received
✓ Converted / prepared for settlement
```

Then:

# **HANDOFF TO POLLAR**

Animated transition.

```text
┌───────────────────────┐
│ KORA                  │
│ African Funding Layer │
└───────────┬───────────┘
            │
            │ USDC
            ▼
══════════════════════════
         POLLAR
══════════════════════════
            │
            ▼
      USDC TRANSFER
            │
            ▼
     🇧🇴 BOB PAYOUT
        MOCKED
```

That directly answers the challenge.

---

# And the mocked BOB payout is actually an advantage

Don't hide it.

Make it obvious:

### **Bolivia settlement simulation**

```text
Pollar USDC transfer confirmed ✓

        ↓

BOB payout

        ↓

Bs 6XX.XX

SIMULATED FINAL PAYOUT
```

Then:

> **Pollar handles the Bolivian BOB ramp.**

That shows we understood the division of responsibilities instead of pretending we built something we didn't.

---

# This also changes our demo

I'd make the entire demo about **one African user**.

### Demo:

> "I'm a Nigerian freelancer."

> "I need to pay Carlos, a designer in Bolivia."

Type:

**Send ₦100,000 to Carlos in Bolivia for a logo.**

KORA:

> **Got it.**

Then:

```text
PAYMENT INTENT

₦100,000
Nigeria 🇳🇬

→ Carlos
→ Bolivia 🇧🇴

Purpose: Logo design
```

Then:

### Choose African funding

**Bank Transfer**

KORA generates:

```text
FUNDING REQUEST

Amount
₦100,000

Bank
KORA Demo Funding Account

Reference
KORA-8F92A
```

User completes the sandbox/semi-manual funding.

Then:

# **Funding received ✓**

And now comes the money handoff.

---

# This is where we should flex Pollar

Show:

```text
AFRICAN LEG COMPLETE

₦100,000
       ↓
USDC

        ↓

HANDING OFF TO POLLAR
```

Then actual Pollar testnet transaction.

**Sponsored transaction.**

**Real USDC transfer.**

That's the important proof.

Then:

```text
POLLAR TRANSFER CONFIRMED ✓
```

Then mock:

```text
BOB PAYOUT

Carlos
🇧🇴 Bolivia

Bs XXX.XX

SIMULATED
```

---

# What about Idle Earn now?

It actually becomes **more interesting**, because it belongs to the period **between African funding and the scheduled payment**.

Example:

> "Pay Carlos tomorrow at 10 AM."

KORA:

```text
PAYMENT SCHEDULED

₦100,000
Payment: Tomorrow 10:00 AM

┌──────────────────────────┐
│ Earn Until Needed?       │
│                          │
│ Put eligible USDC to     │
│ work while waiting.      │
│                          │
│ [✓]                      │
└──────────────────────────┘
```

Then:

```text
AFRICAN FUNDING
      ↓
USDC
      ↓
POLLAR EARN
      ↓
EXIT WHEN PAYMENT IS DUE
      ↓
POLLAR TRANSFER
      ↓
MOCK BOB PAYOUT
```

That's a **beautiful story**.

But again, only implement this if Pollar gives us enough time/access to actually demonstrate the Earn flow.

---

# I'd actually rename the whole architecture

### Before

**KORA**
Intent-Based Cross-Border Payments

### Now

# **KORA**

## **The African Money Layer for Pollar**

Then tagline:

> **Tell us where your money needs to go. We'll handle the way it gets there.**

And our technical description:

> KORA is an intent-driven African funding layer that connects local African payment rails to Pollar's global payment infrastructure.

That's **much more directly aligned with the judging criteria.**

---

# One more thing I'd build: the African Rail Map

This could be a killer visual.

On the funding screen:

```text
          AFRICA

 🇳🇬 Nigeria ────────┐
                     │
 🇬🇭 Ghana ──────────┤
                     │
 🇰🇪 Kenya ──────────┤
                     ├──── KORA ──── POLLAR
 🇺🇬 Uganda ─────────┤
                     │
 🇿🇦 South Africa ───┘
```

Click Nigeria:

```text
🇳🇬 NIGERIA

Bank Transfer       ✓ DEMO
P2P                  ✓ DEMO
Mobile Money         ◌ Planned
Agent                ◌ Planned
```

This visually communicates the entire thesis:

**Many African rails → one KORA interface → Pollar.**

---

# So the priority becomes VERY clear

### 🥇 P0 — African funding path

This is literally the challenge.

### 🥇 P0 — Pollar testnet handoff

Actual wallet + sponsored transaction + USDC transfer.

### 🥇 P0 — Mocked BOB payout

Clearly labelled simulation.

### 🥈 P1 — AI payment intent

Makes the experience special.

### 🥈 P1 — Beautiful route visualization

Makes the demo memorable.

### 🥉 P2 — Earn Until Needed

Excellent bonus.

### 🥉 P2 — KORA SPLIT

Only if everything else works.

---

## And honestly bro...

**I like this version more than our original concept.**

Because now we're not trying to compete with Pollar.

We're answering the exact missing piece they handed builders:

> **"How does Africa connect to Pollar?"**

And our answer becomes:

> **"Give Africans one intelligent interface for whatever local rail they already use. KORA normalizes that money into a Pollar-compatible payment, then hands it off."**

That's a **much sharper hackathon thesis.**

And the killer demo isn't "look, we sent USDC."

It's:

**₦100,000 sitting in a Nigerian bank → KORA → Pollar → USDC → Bolivian recipient.**

The only piece we simulate is the piece **Pollar explicitly told us to simulate.**

That is exactly the kind of scope I'd want going into judging.
