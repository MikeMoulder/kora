'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePollar } from '@pollar/react';
import { ArrowUpRight } from 'lucide-react';
import { Flag } from './Flag';
import { Button, Money, Note, OwnerTag, Panel, Row, SectionLabel, cn } from './ui/primitives';
import type { IntentResponse, QuoteResponse } from '@/lib/client';
import type { KoraFundingRequest } from '@/lib/corridor/types';
import {
  HORIZON_URL,
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
 * Everything before this point is KORA's, drawn solid. Everything after it is
 * Pollar's, drawn outlined. The transfer here is a real, sponsored, on-chain
 * transaction on Stellar testnet, the one part of the corridor that is not
 * simulated and the reason the receipt can carry a hash anyone can check.
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
  if (!isPollarConfigured()) return <NotConfigured />;

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
    <Panel className="rise p-5">
      <div className="flex items-center justify-between">
        <SectionLabel>Hand-off to Pollar</SectionLabel>
        <OwnerTag owner="theirs">Pollar</OwnerTag>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        The African leg above ran for real. The hand-off needs configuration before it can
        put a transaction on Stellar.
      </p>

      <div className="mt-4 space-y-2.5">
        {gaps.map((gap) => (
          <div key={gap.key} className="leg-simulated rounded-lg p-3.5">
            <code className="font-mono text-[11px] text-ink">{gap.key}</code>
            <p className="mt-1.5 text-sm text-ink">{gap.what}</p>
            <p className="mt-1 text-xs text-ink-muted">{gap.how}</p>
          </div>
        ))}
      </div>
    </Panel>
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
  const { isAuthenticated, wallet, openLoginModal, sendPayment, configStatus } = usePollar();
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
        return;
      }

      const detail =
        (outcome as { details?: string }).details ??
        (outcome as { errorCode?: string }).errorCode ??
        'The network rejected the transfer.';

      const needsAsset =
        detail.toLowerCase().includes('underfunded') || detail.includes('op_no_trust');

      setError(
        needsAsset
          ? `${detail}. The wallet needs ${SETTLEMENT_ASSET} on ${STELLAR_NETWORK}. Set NEXT_PUBLIC_SETTLEMENT_ASSET=XLM if you cannot get testnet USDC.`
          : detail,
      );
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
    <Panel className="rise p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionLabel>Hand-off to Pollar</SectionLabel>
          <p className="mt-2.5 max-w-md text-sm leading-relaxed text-ink-soft">
            The African leg settled. From here Pollar moves the value, a sponsored transfer
            on Stellar {STELLAR_NETWORK}, with the user paying no network fee.
          </p>
        </div>
        <OwnerTag owner="theirs">Pollar</OwnerTag>
      </div>

      <div className="leg-theirs mt-5 rounded-lg px-4 py-3">
        <Row label="Transferring">
          <Money amount={quote.quote.receiveUsdc} currency={SETTLEMENT_ASSET} />
        </Row>
        <Row label="To settlement account">
          <a
            href={explorerAccountUrl(SETTLEMENT_ADDRESS)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs underline underline-offset-4"
          >
            {SETTLEMENT_ADDRESS.slice(0, 6)}&hellip;{SETTLEMENT_ADDRESS.slice(-6)}
          </a>
        </Row>
      </div>

      {!isAuthenticated ? (
        <div className="mt-5">
          <Note>
            Pollar creates the wallet on sign-in, a Stellar account with the key encrypted in
            AWS KMS. No seed phrase, no address and no trustline prompt for the user.
          </Note>
          {/*
            * Pollar's own login modal rather than a hard-coded provider.
            *
            * It offers whatever the app has enabled — email code, a social
            * provider, a passkey, an external wallet — instead of committing
            * this screen to one of them. Hosted OAuth also needs redirect URIs
            * registered on the app, and calling `login({ provider: 'google' })`
            * directly turns a missing dashboard setting into a dead button
            * with the reason buried in a redirect. The modal lets someone pick
            * a method that does work.
            */}
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={openLoginModal}
            disabled={configStatus === 'loading'}
          >
            {configStatus === 'loading' ? 'Loading Pollar' : 'Sign in with Pollar'}
          </Button>
        </div>
      ) : (
        <div className="mt-5">
          <Row label="Sending wallet" note="Created by Pollar on sign-in">
            <span className="font-mono text-xs text-ink-soft">
              {wallet?.address
                ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-6)}`
                : '—'}
            </span>
          </Row>

          <GasCheck address={wallet?.address ?? null} />

          <Button variant="outline" className="mt-4 w-full" onClick={send} busy={busy}>
            {busy
              ? 'Submitting to Stellar'
              : `Hand off ${quote.quote.receiveUsdc.toFixed(2)} ${SETTLEMENT_ASSET}`}
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <Note tone="strong">{error}</Note>
        </div>
      )}
    </Panel>
  );
}

// ---- Payment passport ---------------------------------------------------

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
    <div className="rise space-y-4">
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-rule bg-paper-sunk px-5 py-3.5">
          <SectionLabel>Payment passport</SectionLabel>
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-ink" />
            Settled
          </span>
        </div>

        <div className="px-5 py-6">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div>
              <div className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Sent</div>
              <div className="mt-1">
                <Money amount={quote.quote.amount} currency={quote.quote.currency} size="xl" />
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                {corridor && <Flag code={corridor.country} size={13} />}
                {corridor?.countryName}, {corridor?.railLabel}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                Recipient receives
              </div>
              <div className="tabular mt-1 text-[28px] font-semibold tracking-[-0.02em]">
                Bs {quote.destinationEstimate.amount.toLocaleString()}
              </div>
              <div className="mt-2 flex items-center justify-end gap-1.5 text-xs text-ink-muted">
                <Flag code={intent.intent.destinationCountry ?? 'BO'} size={13} />
                {intent.intent.recipientName ?? 'Recipient'}, Bolivia
              </div>
            </div>
          </div>

          <div className="mt-7 divide-y divide-rule border-t border-rule pt-1">
            <Row label="Route">
              <span className="font-mono text-xs">
                {quote.quote.currency} &rarr; {SETTLEMENT_ASSET} &rarr; BOB
              </span>
            </Row>
            <Row label="African leg" note={corridor?.readinessNote}>
              <OwnerTag owner="ours">
                KORA, {corridor?.rail} ({corridor?.readiness})
              </OwnerTag>
            </Row>
            <Row label="Funding reference">
              <span className="font-mono text-xs">{funding?.reference ?? '—'}</span>
            </Row>
            <Row label="Fee paid" note="Rail fee plus KORA spread. No FX markup.">
              <span className="tabular text-xs">
                {quote.quote.fee.toLocaleString()} {quote.quote.feeCurrency}
              </span>
            </Row>
            <Row label="Settlement leg">
              <OwnerTag owner="theirs">Pollar, Stellar {STELLAR_NETWORK}</OwnerTag>
            </Row>
            <Row label="Transaction">
              <a
                href={explorerTxUrl(txHash)}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'inline-flex items-center gap-1 font-mono text-xs',
                  'underline underline-offset-4 hover:no-underline',
                )}
              >
                {txHash.slice(0, 10)}&hellip;{txHash.slice(-8)}
                <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
              </a>
            </Row>
            <Row
              label="Bolivian payout"
              note="Pollar's live BOB ramp runs on mainnet via Stereum."
            >
              <OwnerTag owner="simulated">Simulated</OwnerTag>
            </Row>
          </div>
        </div>
      </Panel>

      <Note>
        Everything above the transaction hash is verifiable on a public network. The BOB
        payout is the one step we simulate. It is Pollar&rsquo;s mainnet leg, and the brief
        said not to build it.
      </Note>
    </div>
  );
}

/**
 * Whether the signed-in wallet can pay a network fee.
 *
 * Pollar sponsors the base reserve and the trustline, so a new wallet exists
 * and can hold USDC while owning no XLM at all. It still cannot pay a fee, and
 * the first transfer fails with "insufficient XLM to cover the network fee" —
 * at the last step, after everything else has worked.
 *
 * Catching it before the button is pressed turns a dead end into a sentence
 * and, on testnet, a fix. The real fix is a starting balance under Treasury,
 * Account Funding, which seeds every wallet at creation; this is for the ones
 * created before that was set.
 */
function GasCheck({ address }: { address: string | null }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [funding, setFunding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!address) return;

    try {
      const account = await fetch(`${HORIZON_URL}/accounts/${address}`, {
        cache: 'no-store',
      }).then((r) => (r.ok ? r.json() : null));

      const native = (account?.balances ?? []).find(
        (entry: { asset_type?: string }) => entry.asset_type === 'native',
      );

      setBalance(native ? Number(native.balance) : 0);
    } catch {
      // Horizon being unreachable is not a reason to block the attempt.
      setBalance(null);
    }
  }, [address]);

  useEffect(() => {
    check();
  }, [check]);

  const topUp = useCallback(async () => {
    if (!address) return;

    setFunding(true);
    setError(null);

    try {
      const body = await fetch('/api/pollar/faucet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address }),
      }).then((r) => r.json());

      if (!body.ok) throw new Error(body.error ?? 'The faucet declined.');

      setBalance(Number(body.data.balance ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The faucet declined.');
    } finally {
      setFunding(false);
    }
  }, [address]);

  // Enough for a fee many times over. Below this the transfer will fail.
  if (balance === null || balance >= 1) return null;

  return (
    <div className="leg-simulated mt-4 rounded-lg px-4 py-3">
      <p className="text-xs leading-relaxed">
        This wallet holds no XLM, so it cannot pay the Stellar network fee. Pollar sponsored
        its reserve and its trustline, but not the fee.
      </p>

      {STELLAR_NETWORK === 'testnet' ? (
        <>
          <Button
            variant="outline"
            className="mt-3 w-full"
            onClick={topUp}
            busy={funding}
          >
            {funding ? 'Asking Friendbot' : 'Fund it from the testnet faucet'}
          </Button>
          <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">
            Testnet XLM, which has no value. The lasting fix is a starting balance under
            Treasury, Account Funding, which seeds every wallet at creation.
          </p>
        </>
      ) : (
        <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">
          Set a starting balance under Treasury, Account Funding, or turn on fee
          sponsorship.
        </p>
      )}

      {error && <p className="mt-2 text-[11px]">{error}</p>}
    </div>
  );
}
