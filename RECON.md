# Pollar SDK — Verified Recon

Everything below was verified against the published package (`@pollar/core@0.11.3`,
extracted from the npm tarball) and `docs.pollar.xyz/llms-full.txt` on 2026-09-17.
Where the docs site and the package disagree, **the package wins** — the docs
landing page still advertises v0.4.3.

## Hard facts

| Fact | Value |
| --- | --- |
| Core package | `@pollar/core@0.11.3` (published 2026-08-24, actively maintained) |
| React package | `@pollar/react@0.11.3` |
| API base | `https://sdk.api.pollar.xyz` |
| Key format | `pub_testnet_…` (frontend), `sec_testnet_…` (backend only) |
| Key source | dashboard.pollar.xyz → Build → API Keys → Generate (self-serve, Google/GitHub/email OTP) |
| **Testnet rate limit** | **1,000 requests/day per key** |
| Chain | Stellar (testnet default), Solana secondary |
| Node requirement | 20+ (we have v22.18.0) |
| Example app | github.com/pollar-xyz/demo-nextjs · live at demo-nextjs.pollar.xyz |

The rate limit is the one that bites: the SDK signs a DPoP proof per authenticated
request, and `pollRampTransaction` / `pollKycStatus` / `getTxStatus` all poll.
Set generous `intervalMs` and avoid polling loops in dev.

## What the SDK actually does

Verified from `README.md` in the package, API Reference section:

- **Auth** — Google, GitHub, OIDC, email OTP, passkey smart wallets, external
  Stellar wallets (Freighter/Albedo), Solana SIWS. Every request DPoP-signed (RFC 9449).
- **Wallets** — custodial G-address created on login, key encrypted with AWS KMS.
  User never sees a seed phrase, address, or trustline prompt.
- **Payments** — `sendPayment()` / `runTx('payment', …)`. **Fees paid by the app's
  sponsorship wallet — users pay zero XLM.**
- **Ramps (SEP-24)** — `getRampsQuote`, `createOnRamp`, `createOffRamp`,
  `getRampCountries`, `pollRampTransaction`.
- **Earn** — `getEarnProviders` / `getEarnOpportunities` / `earnDeposit` / `earnWithdraw`
  across Blend pools and DeFindex vaults, with live APY.
  ⚠️ `getEarnProviders()` returns `[]` unless Earn is enabled in the dashboard.
- **Swaps** — SDEX / Soroswap / Aquarius, one priced route per venue.
- **KYC** — `startKyc` / `pollKycStatus`. Backend marked *coming soon*.
- **React UI** — `<WalletButton>`, `<SendModal>`, `<RampWidget>`, `<EarnModal>`, etc.
  Each has a `…Template` variant, so **the logic can be reused with our own design.**

## The finding that defines the product

Pollar's docs state the unit of a ramp precisely:

> "The real unit of a ramp is the **corridor**: direction + country + fiat + rail +
> the on-chain asset the user ends up with. Corridors are seeded from what the backend
> can actually execute … so the dashboard can never enable a route with no code behind it."

And here is Pollar's **complete** corridor coverage today:

| Provider | Direction | Country | Fiat | Rail | Asset |
| --- | --- | --- | --- | --- | --- |
| Bridge | Buy, Sell | BR | BRL | Pix | USDC on Stellar |
| PagFinance | Buy | BR | BRL | Pix | USDC on Stellar |
| Abroad Finance | Sell | BR | BRL | Pix | USDC on Stellar |
| Abroad Finance | Sell | CO | COP | BreB | USDC on Stellar |
| Etherfuse | Buy, Sell | MX | MXN | SPEI | USDC on Stellar |
| Stereum | Buy | BO | BOB | QR | USDC on Stellar |
| Stereum | Sell | BO | BOB | ACH | USDC on Stellar |

**Brazil, Colombia, Mexico, Bolivia. Four countries, one continent. Africa: zero.**

Bolivia's BOB leg is Stereum, on mainnet — which is exactly the leg the Pollar team
told us not to build.

## Constraints this imposes

1. **No fiat ramp works on testnet at all.** The example-app matrix lists
   "SEP-24 fiat deposit — fiat on-ramp via Anclap testnet" as `coming soon`.
   Pollar's *own* fiat leg is simulated on testnet. So a simulated African fiat leg
   is not a shortcut — it is the only thing testnet permits, for anyone.
2. **`x402` appears nowhere in the docs.** The hackathon blurb mentions it; the
   shipped SDK does not. Do not build on it.
3. **KYC backend is `coming soon`** — `<KycModal>` is a UI preview.
4. **Dashboard gates features.** Earn providers, enabled assets/trustlines, allowed
   domains and the sponsorship wallet must all be configured or the calls return
   empty/fail.

## What is genuinely ours to build

The African corridor set does not exist in Pollar's registry, and no provider adapter
backs it. That gap — not the UI on top of it — is the product.
