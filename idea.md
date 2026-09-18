# KORA
## Intent-Based Cross-Border Payments

> **Money, without borders.**
>
> Tell KORA where your money needs to go. KORA figures out how to move it.

---

# 1. Executive Summary

KORA is an AI-powered cross-border payment agent built on Pollar.

The core idea is simple:

Instead of forcing users to understand wallets, exchanges, blockchain networks, bridges, stablecoins, or foreign currencies, KORA lets them describe what they want to accomplish with money in plain language.

For example:

> "Send ₦100,000 to Carlos in Bolivia for his design work."

KORA interprets that instruction as a **Payment Intent**, determines the appropriate route, guides the sender through a local African funding method, converts the value into USDC, routes the payment through Pollar, and ultimately settles the recipient in Bolivia.

### Core corridor

**Nigeria / Africa → Pollar → Bolivia / Latin America**

Conceptually:

**NGN → USDC → BOB**

The user experiences one simple payment. KORA handles the complexity underneath.

The flagship hackathon challenge specifically asks builders to create the African leg of an Africa ↔ Latin America corridor, while Pollar provides the Latin American side and a live Bolivian BOB ramp. KORA is designed directly around that challenge.

---

# 2. The Problem

Cross-border payments remain unnecessarily complicated for ordinary people and businesses.

A user who wants to pay someone in another country may have to understand:

- Exchange rates
- International transfers
- Local bank rails
- Mobile money
- Crypto wallets
- Stablecoins
- Blockchain networks
- Gas/network fees
- Bridges
- On/off-ramps
- Settlement times
- Recipient currencies

This creates a mismatch:

### People think in terms of outcomes.

> "Pay my designer."

> "Send my supplier their money."

> "Pay Carlos $80."

### Financial infrastructure thinks in terms of rails.

> Bank transfer → FX → intermediary → settlement → wallet → blockchain → off-ramp → local currency.

KORA sits between these two worlds.

---

# 3. The Core Thesis

## Money should understand what you want to accomplish, not make you understand how money moves.

KORA introduces an **Intent Layer** on top of Pollar's payment infrastructure.

The user specifies:

- Who
- Where
- How much
- Why
- When
- How they want to fund it

KORA transforms that into an executable payment workflow.

---

# 4. Product Concept

## KORA = Intent-Based Cross-Border Payments

The primary interface is a conversational payment composer.

Example:

> "Send ₦100,000 to Carlos in Bolivia for his logo design."

KORA extracts:

```json
{
  "source_currency": "NGN",
  "amount": 100000,
  "destination_country": "BO",
  "recipient": "Carlos",
  "purpose": "logo design",
  "timing": "now"
}
```

The application then generates a payment route.

### Example result

```text
YOU SEND
₦100,000

        ↓

LOCAL AFRICAN FUNDING
Nigeria Bank Transfer

        ↓

CONVERSION
$61.42 USDC

        ↓

POLLAR
Cross-border payment infrastructure

        ↓

BOLIVIA
BOB settlement

        ↓

RECIPIENT
Bs 423.18
```

The exact amounts, rates, fees and settlement status shown in the real demo must come from the live/test Pollar flow rather than hardcoded claims.

---

# 5. Why KORA Fits the Pollar Hackathon

The Pollar hackathon has one central challenge:

> Build something real with Pollar that moves money, with a flagship challenge around connecting Africa and Latin America.

Pollar provides infrastructure for:

- Wallets
- Local-currency on/off-ramps
- KYC
- Payments
- Yield / Earn through Blend and DeFindex
- Agent payments / x402
- Stablecoin-based movement

The flagship challenge specifically allows the African side to use:

- Mobile money
- Bank transfer
- P2P
- Agents
- Sandbox flows
- Documented semi-manual flows

KORA therefore does not need to pretend that every African rail is already fully automated.

The MVP can make one African corridor genuinely usable and clearly document how additional countries/rails plug into the same abstraction.

---

# 6. The Product Experience

## 6.1 Landing Page

The landing page should feel like a premium fintech product rather than a crypto dashboard.

Hero:

# Money,
# without borders.

Subheading:

> Tell KORA where your money needs to go.

Input:

```text
Send ₦100,000 to Carlos in Bolivia
for his design work.
```

KORA responds with the payment plan.

---

# 7. Payment Intent

The central product primitive is the **Payment Intent**.

A payment intent contains:

```text
WHO
Carlos

WHERE
Bolivia 🇧🇴

HOW MUCH
₦100,000

WHY
Logo design

WHEN
Now

FUNDING
Nigeria bank transfer
```

This becomes the machine-readable instruction that drives the payment workflow.

This abstraction is important because it makes the architecture extensible.

The same intent engine can eventually support:

- Freelancers
- Merchants
- Payroll
- Marketplaces
- Creator payments
- Supplier payments
- Family transfers
- Scheduled payments
- Recurring payments
- Multi-recipient payouts

---

# 8. The Payment Flow

## Step 1: User states intent

Example:

> "Send ₦100,000 to Carlos in Bolivia."

## Step 2: KORA parses the request

Extract:

- Amount
- Source currency
- Destination
- Recipient
- Timing
- Optional purpose

## Step 3: KORA creates a route

Example:

```text
Nigeria
   ↓
Local funding rail
   ↓
USDC
   ↓
Pollar
   ↓
Bolivia BOB ramp
   ↓
Carlos
```

## Step 4: User reviews

Show:

```text
You're sending

₦100,000

Carlos receives approximately

Bs XXX

Fee

₦XXX

Route

Nigeria → Pollar → Bolivia

Recipient

Carlos M.

Purpose

Logo design
```

## Step 5: User confirms

Button:

**Confirm ₦100,000 payment**

## Step 6: Live transaction timeline

```text
✓ Payment request created

✓ African funding confirmed

✓ USDC conversion initiated

✓ Pollar transfer initiated

✓ Bolivia payout initiated

✓ Recipient paid
```

Only mark a step as completed when the underlying integration actually confirms it.

---

# 9. The Route Visualization

This should be one of the strongest visual elements in the demo.

Show money moving across a map or stylized route:

```text
🇳🇬 LAGOS

₦100,000
    │
    ▼
LOCAL FUNDING
    │
    ▼
USDC
    │
    ▼
━━━━━━━━━━━━━━━━
     POLLAR
━━━━━━━━━━━━━━━━
    │
    ▼
STELLAR / PAYMENT RAIL
    │
    ▼
BOB
    │
    ▼
🇧🇴 BOLIVIA
```

A small animated transaction particle should move from Nigeria to Pollar and then to Bolivia.

The goal is to visually communicate:

**One payment. Multiple financial rails. Zero complexity for the user.**

---

# 10. Payment Passport

After settlement, KORA generates a simple receipt called a **Payment Passport**.

Example:

```text
KORA PAYMENT PASSPORT

Sender
Michael · Nigeria 🇳🇬

Recipient
Carlos · Bolivia 🇧🇴

Amount sent
₦100,000

Amount received
Bs XXX

Route
NGN → USDC → BOB

Infrastructure
Pollar

Network
Stellar

Status
SETTLED ✓
```

Include:

- Transaction/reference ID
- Timestamp
- Source amount
- Recipient amount
- Fees
- Route
- Settlement status
- Explorer link where appropriate

This makes the payment feel transparent and verifiable.

---

# 11. KORA SPLIT

A major extension is multi-recipient payments.

A business could upload:

```text
Carlos     $80
Maria      $120
Diego      $45
```

KORA calculates:

```text
Total
$245

Recipients
3

Funding source
Nigeria

Route
NGN → USDC → BOB
```

Then it executes or prepares the individual payments.

This turns KORA from a simple remittance experience into infrastructure for:

- Cross-border payroll
- Freelance teams
- Marketplaces
- Agencies
- Creator teams
- Supplier payments

For the hackathon MVP, this can be demonstrated as a prepared batch flow if full batch execution is too time-consuming.

---

# 12. African Funding Layer

The architecture should abstract away the specific African rail.

The UI can present:

## Fund locally

### 🇳🇬 Nigeria

- Bank transfer
- P2P
- Agent

### 🇬🇭 Ghana

- Mobile money
- Bank transfer

### 🇰🇪 Kenya

- Mobile money
- Bank transfer

### 🇺🇬 Uganda

- Mobile money
- Bank transfer

Only the rails that are genuinely connected should be presented as live.

Other countries can be labelled:

**Coming soon**

This communicates a larger vision without pretending the MVP has integrations that do not exist.

---

# 13. The Semi-Manual MVP Strategy

The hackathon explicitly allows a documented semi-manual flow.

Therefore:

### Do not fake automation.

If Nigerian funding cannot be fully automated within the hackathon timeframe:

1. User selects Nigeria.
2. KORA generates the funding instructions.
3. User funds the designated/demo flow.
4. Backend/operator confirms receipt where necessary.
5. Pollar transaction executes.
6. KORA displays the real status.

The UI should clearly label any semi-manual step.

This is better than fabricating a fully automated Nigerian banking integration.

---

# 14. Idle Earn: Yield While In Transit

## Verdict: YES, but make it a controlled bonus feature.

The "Idle Earn" idea is genuinely interesting because it gives KORA another dimension beyond simply moving money.

The concept:

> **Earn yield while your payment is waiting.**

Suppose a user needs to pay someone tomorrow rather than immediately.

Instead of leaving the escrowed USDC idle, KORA can optionally route eligible funds into Pollar Earn, using the supported Blend / DeFindex infrastructure.

### UI

During scheduling:

```text
PAYMENT TIMING

○ Send now
● Schedule for tomorrow

────────────────────

While your payment waits:

[✓] Earn yield while in transit?

Your USDC may be allocated to
supported Pollar Earn strategies.

[Learn how it works]
```

The important part is that this must **not** be presented as guaranteed profit.

---

# 15. How Idle Earn Should Work

Conceptually:

```text
USER
 │
 │ schedules payment
 ▼
KORA
 │
 │ funds held for future payout
 ▼
ELIGIBILITY CHECK
 │
 ├── eligible → Pollar Earn
 │
 └── not eligible → remain in payment balance
 │
 ▼
YIELD PERIOD
 │
 ▼
EXIT / WITHDRAW
 │
 ▼
POLLAR PAYMENT
 │
 ▼
RECIPIENT
```

The exact implementation depends on Pollar's current Earn APIs, supported assets, withdrawal mechanics, lockups, strategy availability and risk disclosures.

Do not invent these details.

---

# 16. Why Idle Earn Is Powerful

It creates a compelling new product primitive:

## Money can be productive while waiting to become useful.

Examples:

### Scheduled freelancer payment

> "Pay Carlos tomorrow at 10 AM."

The payment is not needed immediately.

KORA can offer:

> "Your payment is scheduled for tomorrow. Would you like eligible funds to earn while waiting?"

### Payroll

> "Pay my team on Friday."

Funds could potentially be placed into an eligible yield strategy during the waiting period.

### Supplier settlement

> "Pay supplier after delivery confirmation."

Funds remain pending while the payment condition is unresolved.

This begins to make KORA look less like a remittance app and more like an **intelligent money orchestration layer**.

---

# 17. Important Safety / UX Rule for Idle Earn

Never hide the fact that yield introduces additional risk and conditions.

The UI should disclose:

- Yield is not guaranteed.
- Strategy performance can change.
- There may be withdrawal/settlement timing constraints.
- Funds may be subject to strategy-specific risks.
- Availability depends on Pollar's supported Earn products.
- The user can choose not to use Earn.

The user should always have a simple:

**Don't earn → Send normally**

option.

---

# 18. A More Advanced Version: "Earn Until Needed"

Instead of calling it simply "Idle Earn", the user-facing language could be:

## Earn Until Needed

Example:

> **Payment scheduled for tomorrow**
>
> Your eligible USDC can potentially earn while waiting.
>
> [✓] Earn until payment time

This is much more intuitive than talking about "yield integration" to ordinary users.

---

# 19. Scheduled Payments

This naturally extends the Payment Intent model.

Example:

> "Send $200 to Carlos every Friday."

KORA turns that into:

```text
RECIPIENT
Carlos

AMOUNT
$200

FREQUENCY
Weekly

NEXT PAYMENT
Friday

FUNDING
USDC

OPTION
Earn until needed
```

The long-term vision is an **agent that manages financial obligations**, not just one-off transfers.

For the hackathon, this should remain a demo/roadmap feature unless the Pollar integration can support it safely in the available time.

---

# 20. "Fair Route" Transparency

KORA should show the user where their money goes.

Example:

```text
YOUR FUNDING

₦100,000

────────────────

African funding
₦XXX

Conversion
₦XXX

Pollar/payment costs
₦XXX

Recipient value
₦XXX equivalent
```

Do not hardcode these values.

Populate them from actual quotes/transaction data wherever possible.

The principle:

> **No black box exchange rate.**

The user should understand the route before confirming.

---

# 21. AI's Actual Role

AI should not be decorative.

KORA's AI has a specific job:

### Human language → structured payment intent.

Input:

> "I owe Carlos 80 bucks for the logo. He's in Bolivia. Pay him tomorrow."

Output:

```json
{
  "recipient": "Carlos",
  "amount": 80,
  "currency": "USD",
  "destination_country": "BO",
  "purpose": "logo",
  "scheduled_for": "tomorrow"
}
```

Then deterministic application logic handles:

- Validation
- Quotes
- Route selection
- Confirmation
- Payment execution
- Status tracking

This separation is important.

### AI decides what the user means.

### Application logic decides what can actually happen.

### Pollar moves the money.

---

# 22. Guardrails

KORA should never allow an AI model to autonomously move funds merely because the model generated an instruction.

Require explicit user confirmation before money movement.

Example:

```text
KORA understood:

Send ₦100,000
to Carlos
in Bolivia
for logo design

Recipient receives approximately Bs XXX.

[Cancel] [Confirm payment]
```

The payment execution should only happen after confirmation.

---

# 23. Agentic Future

Once the basic payment agent works, KORA can become much more powerful.

Users could eventually say:

> "Pay approved invoices below $500."

or:

> "Keep $1,000 available for my contractors and pay them when their invoices are approved."

or:

> "Whenever I receive my client payment, send 20% to my Bolivian design team."

KORA becomes an orchestration layer for cross-border financial workflows.

This is where Pollar's agent-payment/x402 capabilities can become relevant.

---

# 24. Target Users

## 1. African freelancers

Pay international collaborators and contractors.

## 2. African businesses

Pay Latin American suppliers and service providers.

## 3. Global agencies

Pay distributed teams.

## 4. Marketplaces

Facilitate seller payouts.

## 5. Creators

Pay international collaborators.

## 6. Individuals

Send personal money internationally.

## 7. Web3 teams

Use stablecoin settlement without forcing every participant to understand crypto infrastructure.

---

# 25. Initial Beachhead

Do not try to serve everyone on day one.

The hackathon demo should focus on:

## African businesses and freelancers paying Latin American collaborators.

Example:

> Nigerian founder → Bolivian designer.

This is a clean, believable use case for the Africa ↔ Latin America flagship challenge.

---

# 26. Product Architecture

```text
                         KORA
                           │
                 ┌─────────▼─────────┐
                 │   Intent Engine   │
                 │        AI         │
                 └─────────┬─────────┘
                           │
                    Payment Intent
                           │
                 ┌─────────▼─────────┐
                 │   Route Engine    │
                 └─────────┬─────────┘
                           │
              ┌────────────▼────────────┐
              │ African Funding Layer   │
              │ Bank / Mobile / P2P /   │
              │ Agent                   │
              └────────────┬────────────┘
                           │
                           ▼
                        USDC
                           │
                    ┌──────▼──────┐
                    │   POLLAR    │
                    └──────┬──────┘
                           │
                    Cross-border
                       settlement
                           │
                           ▼
                         BOB
                           │
                           ▼
                       Recipient
```

---

# 27. Suggested Technical Stack

## Frontend

- Next.js
- React
- Tailwind CSS
- Framer Motion
- Pollar React SDK

## Backend

- Node.js
- Express or Next.js API routes
- Pollar Core SDK

## AI

Any reliable LLM that can produce structured JSON/function-call output.

AI should be constrained to payment-intent extraction rather than unrestricted transaction execution.

## Storage

For MVP:

- LocalStorage for session/demo state
- Lightweight database if persistent payment records are required

## Real-time updates

- SSE or WebSocket if useful
- Poll Pollar transaction status if that is the simplest reliable mechanism

---

# 28. Suggested App Structure

```text
/
├── Landing
├── Send
├── Route
├── Payment Review
├── Payment Success
├── Activity
├── Payment Passport
└── Settings
```

Optional:

```text
/earn
/scheduled
/batch
```

Do not let optional features compromise the core payment demo.

---

# 29. Visual Direction

The product should NOT look like:

- A generic crypto wallet
- A generic ChatGPT clone
- A DeFi dashboard
- A bank clone

It should feel like:

**Premium fintech + intelligent agent + global payments infrastructure.**

Design language:

- Dark/modern
- Minimal
- Strong typography
- Large transaction numbers
- Subtle motion
- High-quality route animation
- Clear payment states
- Very little unnecessary UI

The main screen should immediately communicate:

**Where is your money going?**

---

# 30. The Demo Story

The demo should tell one simple story.

### Scene 1

"I need to pay a designer in Bolivia."

Type:

> Send ₦100,000 to Carlos in Bolivia for his logo.

### Scene 2

KORA understands.

Shows:

```text
Carlos
Bolivia 🇧🇴

₦100,000
↓
USDC
↓
BOB
```

### Scene 3

User reviews the route.

### Scene 4

User funds through the African rail.

### Scene 5

Pollar processes the cross-border payment.

### Scene 6

Animated route.

### Scene 7

Recipient receives BOB.

### Scene 8

KORA generates the Payment Passport.

### Scene 9

Optional bonus:

Schedule another payment.

Show:

> "Earn until needed?"

This demonstrates the yield concept without distracting from the main corridor.

---

# 31. Demo Script

Use this narrative:

> "Today, if I want to pay someone in another country, I have to understand how money moves."
>
> "KORA flips that."
>
> "I simply tell it what I want."
>
> "Send ₦100,000 to Carlos in Bolivia for his design work."
>
> "KORA turns that sentence into a payment intent."
>
> "It handles the African funding side, converts the value into USDC, routes it through Pollar, and settles the recipient in Bolivia."
>
> "I don't need to understand the infrastructure underneath."
>
> "And because the same payment intent can represent a scheduled or multi-recipient payment, KORA can evolve from a remittance product into an agentic financial operating layer."
>
> "The user sees one payment."
>
> "KORA orchestrates the rails underneath."
>
> **"That's money, without borders."**

---

# 32. Hackathon Differentiation

The project should be positioned around four ideas:

## 1. Intent

Human language becomes an executable financial instruction.

## 2. Corridor

Africa → Pollar → Latin America.

## 3. Transparency

The entire route is visible.

## 4. Productivity

Eligible scheduled funds can potentially earn while waiting through Pollar Earn.

These four ideas make the product more than a wrapper around a payment SDK.

---

# 33. The "Idle Earn" Feature as a Bonus, Not the Main Product

The correct prioritization is:

### P0 — Must work

**Africa → Pollar → Bolivia payment**

### P1 — Strong differentiation

**AI Payment Intent**

### P1 — Strong visual differentiation

**Live Route + Payment Passport**

### P2 — Bonus

**Earn Until Needed**

### P2 — Bonus

**KORA SPLIT**

### P3 — Future

**Recurring agentic payments**

This prevents feature creep.

If time runs out, the product is still complete.

---

# 34. Potential Risks

## Risk: African rail isn't fully automated

Solution:

Use the hackathon's permitted sandbox/semi-manual flow and document it clearly.

## Risk: AI hallucinates payment information

Solution:

AI only parses intent.

Never allow generated text to directly execute payments.

## Risk: Yield feature introduces financial risk

Solution:

Make it optional, disclose risk, and only use Pollar-supported Earn mechanisms.

## Risk: Too many features

Solution:

The main demo is one payment.

Everything else supports the central story.

## Risk: Product becomes a generic chatbot

Solution:

The primary interface should be a payment composer, not an open-ended AI chat.

---

# 35. What NOT To Build

Do not spend hackathon time on:

- A huge social network
- A token
- A complicated DAO
- A custom blockchain
- A complex exchange
- Fake banking integrations
- Autonomous money movement without confirmation
- Dozens of unsupported African countries
- An over-engineered AI agent framework

The strongest product is a small number of things executed extremely well.

---

# 36. MVP Definition

The project is successful if a judge can:

1. Open KORA.
2. Enter a natural-language payment request.
3. See the extracted payment intent.
4. See an Africa → Pollar → Bolivia route.
5. Fund through the available African flow.
6. Confirm a real/test payment through Pollar.
7. See transaction progress.
8. See the recipient-side settlement.
9. Receive a Payment Passport.

Everything else is secondary.

---

# 37. One-Line Pitch

> **KORA is an AI payment agent that turns a sentence into a cross-border payment, connecting African local rails to Latin America through Pollar.**

---

# 38. Short Pitch

> **Tell KORA where your money needs to go.**
>
> KORA turns human payment intent into an executable cross-border workflow, connecting African funding rails to Pollar and ultimately settling recipients in Latin America.
>
> **NGN → USDC → BOB.**
>
> One instruction. One confirmation. One payment.

---

# 39. Long-Term Vision

KORA can eventually become:

## The intent layer for global money.

Today:

> "Send ₦100,000 to Carlos."

Tomorrow:

> "Pay all my contractors."

Later:

> "Keep enough USDC available to cover my approved invoices this month, earn on eligible idle funds, and execute payments when they're due."

The user describes the financial outcome.

KORA orchestrates the underlying rails.

---

# 40. Final Product Positioning

### KORA

**Intent-Based Cross-Border Payments**

**Money, without borders.**

Africa → Pollar → Latin America

Powered by:

- Pollar
- USDC
- Local African rails
- AI payment intents
- Optional Pollar Earn
- Agentic payment infrastructure

The fundamental product principle:

> **The user should never have to understand the rails to move the money.**

---

# 41. Hackathon Build Order

Given the limited remaining time, execute in this order:

## 1. Pollar integration

Get the actual payment/wallet flow working first.

## 2. African funding flow

Implement the real or documented semi-manual path.

## 3. Payment Intent parser

Natural language → structured intent.

## 4. Payment Review

Make the confirmation experience excellent.

## 5. Route Visualization

Make the transaction journey visually impressive.

## 6. Payment Passport

Make settlement verifiable.

## 7. Earn Until Needed

Add only after the payment corridor is stable.

## 8. KORA SPLIT

Only if enough time remains.

---

# 42. Final Priority

If only one thing is remembered:

## Do not build a Pollar wallet.

Build a product that makes Pollar feel like invisible infrastructure.

The judge should think:

> "I understand exactly why Pollar exists underneath this."

KORA should own the user experience.

Pollar should power the money movement.

---

# 43. References

Pollar Hackathon:
https://www.boundlessfi.xyz/hackathons/pollar-hackathon-build-on-pollar?tab=tracks

Pollar Documentation:
https://docs.pollar.xyz/

Pollar Core SDK:
https://www.npmjs.com/package/@pollar/core

Pollar React SDK:
https://www.npmjs.com/package/@pollar/react

Pollar Telegram:
https://t.me/+eRBh0t5gAeZlMzhh

Pollar X:
https://x.com/pollar_xyz
