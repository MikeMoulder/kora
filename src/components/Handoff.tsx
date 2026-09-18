'use client';

import { useCallback, useState } from 'react';
import { usePollar } from '@pollar/react';
import { Button, Card, Money, Note, Pill, Row, SectionLabel } from './ui';
import { Flag } from './Flag';
import type { IntentResponse, QuoteResponse } from '@/lib/client';
import type { KoraFundingRequest } from '@/lib/corridor/types';
import {
  SETTLEMENT_ADDRESS,
  SETTLEMENT_ASSET,
  STELLAR_NETWORK,
  configGaps,
  explorerAccountUrl,
  explorerTxUrl,
  isPollarConfigured,
  settlementAssetParam,
} from '@/lib/pollar/config';

/**
 * The hand-off.
 *
 * Everything before this point is KORA's. Everything after it is Pollar's.
 * The transfer here is a real, sponsored, on-chain transaction on Stellar
 * testnet — the one part of the corridor that is not simulated, and the
 * reason the receipt can carry a hash anyone can check.
 */
export function Handoff({
  quote,
  intent,
  funding,
  txHash,
  onSettled,
}: {
  quote: QuoteResponse;
  intent: IntentResponse;
  funding: KoraFundingRequest | null;
  txHash: string | null;
  onSettled: (hash: string) => void;
}) {
  if (!isPollarConfigured()) {
    return <NotConfigured />;
  }
  return (
    <HandoffLive
      quote={quote}
      intent={intent}
      funding={funding}
      txHash={txHash}
      onSettled={onSettled}
    />
  );
}

function NotConfigured() {
  const gaps = configGaps();

  return (
    <Card leg="pollar" className="p-5 rise">
      <SectionLabel>Hand-off to Pollar</SectionLabel>
      <p className="mt-3 text-sm leading-relaxed text-ink-300">
        The African leg above ran for real. The hand-off needs configuration before it can put a
        transaction on Stellar.
      </p>

      <div className="mt-4 space-y-3">
        {gaps.map((gap) => (
          <div key={gap.key} className="rounded-xl border seam bg-ink-950/50 p-3.5">
            <code className="text-xs text-flow-glow">{gap.key}</code>
            <p className="mt-1.5 text-sm text-ink-200">{gap.what}</p>
            <p className="mt-1 text-xs text-ink-500">{gap.how}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function HandoffLive({
  quote,
  intent,
  funding,
  txHash,
  onSettled,
}: {
  quote: QuoteResponse;
  intent: IntentResponse;
  funding: KoraFundingRequest | null;
  txHash: string | null;
  onSettled: (hash: string) => void;
}) {
  const { isAuthenticated, wallet, login, sendPayment, configStatus } = usePollar();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = quote.quote.receiveUsdc.toFixed(7);

  const send = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await sendPayment({
        destination: SETTLEMENT_ADDRESS,
        amount,
        asset: settlementAssetParam(),
      } as Parameters<typeof sendPayment>[0]);

      const hash = (outcome as { hash?: string }).hash;
      const status = (outcome as { status?: string }).status;

      if (status === 'success' && hash) {
        onSettled(hash);
      } else {
        const detail =
          (outcome as { details?: string }).details ??
          (outcome as { errorCode?: string }).errorCode ??
          'The network rejected the transfer.';
        setError(
          `${detail}${
            detail.toLowerCase().includes('underfunded') || detail.includes('op_no_trust')
              ? ` — the wallet needs ${SETTLEMENT_ASSET} on ${STELLAR_NETWORK}. Set NEXT_PUBLIC_SETTLEMENT_ASSET=XLM if you cannot get testnet USDC.`
              : ''
          }`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The transfer failed.');
    } finally {
      setBusy(false);
    }
  }, [amount, onSettled, sendPayment]);

  if (txHash) {
    return <Passport quote={quote} intent={intent} funding={funding} txHash={txHash} />;
  }

  return (
    <Card leg="pollar" className="p-5 rise">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionLabel>Hand-off to Pollar</SectionLabel>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-300">
            The African leg settled. From here Pollar moves the value — a sponsored transfer on
            Stellar {STELLAR_NETWORK}, with the user paying no network fee.
          </p>
        </div>
        <Pill tone="pollar">Pollar</Pill>
      </div>

      <div className="mt-5 rounded-xl border border-flow-core/25 bg-flow-wash/40 p-4">
        <Row label="Transferring">
          <Money amount={quote.quote.receiveUsdc} currency={SETTLEMENT_ASSET} />
        </Row>
        <Row label="To settlement account">
          <a
            href={explorerAccountUrl(SETTLEMENT_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-flow-glow underline-offset-2 hover:underline"
          >
            {SETTLEMENT_ADDRESS.slice(0, 6)}…{SETTLEMENT_ADDRESS.slice(-6)}
          </a>
        </Row>
      </div>

      {!isAuthenticated ? (
        <div className="mt-5">
          <Note tone="pollar">
            Pollar creates the wallet on sign-in — a Stellar account with the key encrypted in
            AWS KMS. No seed phrase, no address, no trustline prompt for the user.
          </Note>
          <Button
            variant="pollar"
            className="mt-4 w-full"
            onClick={() => login({ provider: 'google' })}
            disabled={configStatus === 'loading'}
          >
            {configStatus === 'loading' ? 'Loading Pollar…' : 'Continue with Google'}
          </Button>
        </div>
      ) : (
        <div className="mt-5">
          <Row label="Sending wallet" note="Created by Pollar on sign-in">
            <span className="font-mono text-xs text-ink-300">
              {wallet?.address ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-6)}` : '—'}
            </span>
          </Row>

          <Button variant="pollar" className="mt-4 w-full" onClick={send} busy={busy}>
            {busy ? 'Submitting to Stellar…' : `Hand off ${quote.quote.receiveUsdc.toFixed(2)} ${SETTLEMENT_ASSET}`}
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <Note tone="warn">{error}</Note>
        </div>
      )}
    </Card>
  );
}

// ── Payment Passport ──────────────────────────────────────────────────────

function Passport({
  quote,
  intent,
  funding,
  txHash,
}: {
  quote: QuoteResponse;
  intent: IntentResponse;
  funding: KoraFundingRequest | null;
  txHash: string;
}) {
  const corridor = intent.resolution.selected;

  return (
    <div className="space-y-5 rise">
      <Card leg="pollar" className="overflow-hidden">
        <div className="border-b seam bg-ink-950/50 px-5 py-4">
          <div className="flex items-center justify-between">
            <SectionLabel>Payment passport</SectionLabel>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-live">
              <span className="h-1.5 w-1.5 rounded-full bg-live" />
              Settled
            </span>
          </div>
        </div>

        <div className="px-5 py-5">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-500">Sent</div>
              <Money
                amount={quote.quote.amount}
                currency={quote.quote.currency}
                size="xl"
                className="text-amber-glow"
              />
              <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
                {corridor && <Flag code={corridor.country} size={13} />}
                {corridor?.countryName} · {corridor?.railLabel}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-ink-500">
                Recipient receives
              </div>
              <span className="tabular text-3xl font-semibold tracking-tight text-flow-glow">
                Bs {quote.destinationEstimate.amount.toLocaleString()}
              </span>
              <div className="mt-1 flex items-center justify-end gap-1.5 text-xs text-ink-500">
                <Flag code={intent.intent.destinationCountry ?? 'BO'} size={13} />
                {intent.intent.recipientName ?? 'Recipient'} · Bolivia
              </div>
            </div>
          </div>

          <div className="mt-6 divide-y divide-ink-800/60 border-t seam pt-2">
            <Row label="Route">
              <span className="font-mono text-xs text-ink-200">
                {quote.quote.currency} → {SETTLEMENT_ASSET} → BOB
              </span>
            </Row>
            <Row label="African leg" note={corridor?.readinessNote}>
              <span className="text-xs text-amber-glow">
                KORA · {corridor?.railLabel} ({corridor?.readiness})
              </span>
            </Row>
            <Row label="Funding reference">
              <span className="font-mono text-xs text-ink-200">{funding?.reference ?? '—'}</span>
            </Row>
            <Row label="Fee paid" note="Rail fee plus KORA spread. No FX markup.">
              <span className="tabular text-xs text-ink-200">
                {quote.quote.fee.toLocaleString()} {quote.quote.feeCurrency}
              </span>
            </Row>
            <Row label="Settlement leg">
              <span className="text-xs text-flow-glow">Pollar · Stellar {STELLAR_NETWORK}</span>
            </Row>
            <Row label="Transaction">
              <a
                href={explorerTxUrl(txHash)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-flow-glow underline-offset-2 hover:underline"
              >
                {txHash.slice(0, 10)}…{txHash.slice(-8)} ↗
              </a>
            </Row>
            <Row label="Bolivian payout" note="Pollar's live BOB ramp runs on mainnet via Stereum.">
              <Pill tone="warn">Simulated</Pill>
            </Row>
          </div>
        </div>
      </Card>

      <Note tone="pollar">
        Everything above the transaction hash is verifiable on a public network. The BOB payout is
        the one step we simulate — it is Pollar&rsquo;s mainnet leg, and the brief said not to
        build it.
      </Note>
    </div>
  );
}
