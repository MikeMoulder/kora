'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Composer } from './Composer';
import { Flag } from './Flag';
import { RouteRail, type RouteNode } from './RouteRail';
import { Handoff } from './Handoff';
import { Button, Card, Money, Note, Pill, ReadinessBadge, Row, SectionLabel, cx } from './ui';
import {
  confirmFunding,
  createFunding,
  getFundingStatus,
  getQuote,
  parseIntent,
  reportPayment,
  type IntentResponse,
  type QuoteResponse,
} from '@/lib/client';
import type { KoraFundingRequest, KoraFundingState } from '@/lib/corridor/types';
import { SETTLEMENT_ASSET } from '@/lib/pollar/config';

type Stage = 'compose' | 'plan' | 'fund' | 'handoff' | 'done';

export function Kora() {
  const [stage, setStage] = useState<Stage>('compose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [funding, setFunding] = useState<KoraFundingRequest | null>(null);
  const [fundingState, setFundingState] = useState<KoraFundingState | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // ── Compose → plan ──────────────────────────────────────────────────────
  const onCompose = useCallback(async (text: string) => {
    setBusy(true);
    setError(null);
    try {
      const parsed = await parseIntent(text);
      setIntent(parsed);

      if (parsed.resolution.status !== 'ready' || !parsed.resolution.selected) {
        setQuote(null);
        setStage('plan');
        return;
      }

      const q = await getQuote(parsed.resolution.selected.id, parsed.intent.amount!);
      setQuote(q);
      setStage('plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that.');
    } finally {
      setBusy(false);
    }
  }, []);

  // ── Plan → fund ─────────────────────────────────────────────────────────
  const onCreateFunding = useCallback(async () => {
    if (!intent?.resolution.selected || !quote) return;
    setBusy(true);
    setError(null);
    try {
      const request = await createFunding(intent.resolution.selected.id, quote.quote);
      setFunding(request);
      setFundingState({
        reference: request.reference,
        status: request.status,
        events: [{ at: request.createdAt, status: request.status, detail: 'Funding request created.' }],
      });
      setStage('fund');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the funding request.');
    } finally {
      setBusy(false);
    }
  }, [intent, quote]);

  // ── Poll funding status while the rail settles ──────────────────────────
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const active =
      stage === 'fund' &&
      funding &&
      (fundingState?.status === 'payment_reported' || fundingState?.status === 'confirming');

    if (!active) {
      if (polling.current) clearInterval(polling.current);
      polling.current = null;
      return;
    }

    polling.current = setInterval(async () => {
      try {
        const { state } = await getFundingStatus(funding!.reference);
        setFundingState(state);
        if (state.status === 'funded') setStage('handoff');
      } catch {
        // Transient. The next tick retries; the user can also confirm manually.
      }
    }, 1500);

    return () => {
      if (polling.current) clearInterval(polling.current);
      polling.current = null;
    };
  }, [stage, funding, fundingState?.status]);

  const onReportPayment = useCallback(async () => {
    if (!funding) return;
    setBusy(true);
    setError(null);
    try {
      setFundingState(await reportPayment(funding.reference));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not report the payment.');
    } finally {
      setBusy(false);
    }
  }, [funding]);

  const onOperatorConfirm = useCallback(async () => {
    if (!funding) return;
    setBusy(true);
    setError(null);
    try {
      const state = await confirmFunding(funding.reference);
      setFundingState(state);
      if (state.status === 'funded') setStage('handoff');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm funding.');
    } finally {
      setBusy(false);
    }
  }, [funding]);

  const reset = useCallback(() => {
    setStage('compose');
    setIntent(null);
    setQuote(null);
    setFunding(null);
    setFundingState(null);
    setTxHash(null);
    setError(null);
  }, []);

  const nodes = useRouteNodes({ stage, intent, quote, fundingState, txHash });

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <Header />

      {stage === 'compose' ? (
        <Hero>
          <Composer onSubmit={onCompose} busy={busy} error={error} />
        </Hero>
      ) : (
        <div className="pt-8">
          <button
            onClick={reset}
            className="mb-6 text-xs text-ink-500 transition-colors hover:text-ink-300"
          >
            ← Start over
          </button>
        </div>
      )}

      {stage !== 'compose' && (
        <section className="mb-8">
          <SectionLabel>Route</SectionLabel>
          <div className="mt-3 lg:-mx-12 xl:-mx-20">
            <RouteRail nodes={nodes} />
          </div>
          <LegLegend />
        </section>
      )}

      {error && stage !== 'compose' && (
        <div className="mb-6">
          <Note tone="warn">{error}</Note>
        </div>
      )}

      {stage === 'plan' && intent && (
        <PlanStage
          intent={intent}
          quote={quote}
          busy={busy}
          onContinue={onCreateFunding}
        />
      )}

      {stage === 'fund' && funding && fundingState && (
        <FundStage
          funding={funding}
          state={fundingState}
          busy={busy}
          onReport={onReportPayment}
          onConfirm={onOperatorConfirm}
        />
      )}

      {(stage === 'handoff' || stage === 'done') && quote && intent && (
        <Handoff
          quote={quote}
          intent={intent}
          funding={funding}
          txHash={txHash}
          onSettled={(hash) => {
            setTxHash(hash);
            setStage('done');
          }}
        />
      )}

      {stage === 'compose' && <ThesisStrip />}
    </main>
  );
}

// ── Route nodes ───────────────────────────────────────────────────────────

function useRouteNodes({
  stage,
  intent,
  quote,
  fundingState,
  txHash,
}: {
  stage: Stage;
  intent: IntentResponse | null;
  quote: QuoteResponse | null;
  fundingState: KoraFundingState | null;
  txHash: string | null;
}): RouteNode[] {
  return useMemo(() => {
    const corridor = intent?.resolution.selected ?? null;
    const funded = fundingState?.status === 'funded';
    const reported =
      fundingState?.status === 'payment_reported' || fundingState?.status === 'confirming';

    return [
      {
        key: 'sender',
        countryCode: corridor?.country,
        title: corridor?.countryName ?? 'Sender',
        value: quote ? `${quote.quote.amount.toLocaleString()} ${quote.quote.currency}` : undefined,
        owner: 'kora',
        state: stage === 'compose' ? 'idle' : 'done',
      },
      {
        key: 'rail',
        title: corridor?.rail ?? 'Local rail',
        subtitle: corridor ? `KORA · ${corridor.readiness}` : undefined,
        owner: 'kora',
        state: funded ? 'done' : reported ? 'active' : stage === 'fund' ? 'active' : stage === 'compose' || stage === 'plan' ? 'idle' : 'done',
      },
      {
        key: 'usdc',
        title: SETTLEMENT_ASSET,
        value: quote ? `${quote.quote.receiveUsdc.toFixed(2)}` : undefined,
        subtitle: 'Hand-off asset',
        owner: 'boundary',
        state: funded ? 'done' : 'idle',
      },
      {
        key: 'pollar',
        title: 'Pollar',
        subtitle: txHash ? 'Transfer confirmed' : 'Stellar testnet',
        owner: 'pollar',
        state: txHash ? 'done' : stage === 'handoff' ? 'active' : 'idle',
      },
      {
        key: 'recipient',
        countryCode: intent?.intent.destinationCountry ?? 'BO',
        title: intent?.intent.recipientName ?? 'Recipient',
        value: quote ? `Bs ${quote.destinationEstimate.amount.toLocaleString()}` : undefined,
        owner: 'pollar',
        state: txHash ? 'done' : 'idle',
        tag: 'Simulated',
      },
    ];
  }, [stage, intent, quote, fundingState, txHash]);
}

function LegLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-500">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-core" />
        KORA built this leg
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-flow-core" />
        Pollar owns this leg
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-sandbox" />
        Simulated, and labelled as such
      </span>
    </div>
  );
}

// ── Header / hero ─────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="flex items-center justify-between py-6">
      <div className="flex items-baseline gap-2.5">
        <span className="text-lg font-bold tracking-tight">KORA</span>
        <span className="hidden text-xs text-ink-500 sm:inline">
          the African corridor for Pollar
        </span>
      </div>
      <nav className="flex items-center gap-2">
        <Link
          href="/operator"
          className="rounded-lg border seam px-3 py-1.5 text-xs text-ink-400 transition-colors hover:border-amber-core/30 hover:text-ink-100"
        >
          Operator
        </Link>
        <Link
          href="/corridors"
          className="rounded-lg border seam px-3 py-1.5 text-xs text-ink-300 transition-colors hover:border-amber-core/30 hover:text-ink-100"
        >
          Corridor registry →
        </Link>
      </nav>
    </header>
  );
}

function Hero({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative pt-10 pb-8 sm:pt-16">
      <div className="aurora pointer-events-none absolute inset-x-0 -top-24 h-72" aria-hidden />
      <div className="relative">
        <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          Money,
          <br />
          <span className="text-ink-400">without borders.</span>
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-ink-400">
          Pollar ramps fiat into Brazil, Colombia, Mexico and Bolivia. It has no African
          corridor. KORA is that corridor — written to Pollar&rsquo;s own adapter contract, so
          the hand-off is native rather than bolted on.
        </p>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function ThesisStrip() {
  return (
    <section className="mt-16 grid gap-3 sm:grid-cols-3">
      {[
        {
          n: '6',
          label: 'rails in Pollar’s enum',
          body: 'SPEI, PIX, PSE, ACH, BREB, QR. Every one of them Latin American.',
        },
        {
          n: '0',
          label: 'African corridors',
          body: 'Pollar’s ramp registry covers BR, CO, MX and BO. Africa is absent.',
        },
        {
          n: '5',
          label: 'rails KORA adds',
          body: 'NIP, M-Pesa, MoMo, P2P and cash agents — declared through one adapter interface.',
        },
      ].map((item) => (
        <Card key={item.label} className="p-5">
          <div className="tabular text-3xl font-bold tracking-tight text-amber-glow">{item.n}</div>
          <div className="mt-1 text-sm font-medium text-ink-200">{item.label}</div>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">{item.body}</p>
        </Card>
      ))}
    </section>
  );
}

// ── Plan stage ────────────────────────────────────────────────────────────

function PlanStage({
  intent,
  quote,
  busy,
  onContinue,
}: {
  intent: IntentResponse;
  quote: QuoteResponse | null;
  busy: boolean;
  onContinue: () => void;
}) {
  const { resolution } = intent;

  return (
    <div className="grid gap-5 rise lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card leg="kora" className="p-5">
        <div className="flex items-center justify-between">
          <SectionLabel>Payment intent</SectionLabel>
          <Pill tone={intent.source === 'gemini' ? 'kora' : 'neutral'}>
            {intent.source === 'gemini' ? 'Gemini + rules' : 'Rule parser'}
          </Pill>
        </div>

        <dl className="mt-4 divide-y divide-ink-800/60">
          <IntentRow label="Recipient" value={intent.intent.recipientName ?? '—'} />
          <IntentRow
            label="Destination"
            value={intent.intent.destinationCountry ?? '—'}
            hint={resolution.destination?.settledBy === 'pollar' ? 'Pollar settles here' : undefined}
          />
          <IntentRow
            label="Amount"
            value={
              intent.intent.amount !== null
                ? `${intent.intent.amount.toLocaleString()} ${intent.intent.currency ?? ''}`
                : '—'
            }
          />
          <IntentRow label="Purpose" value={intent.intent.purpose ?? '—'} />
          <IntentRow
            label="Timing"
            value={
              intent.intent.timing === 'scheduled' && intent.intent.scheduledFor
                ? new Date(intent.intent.scheduledFor).toLocaleString()
                : 'Now'
            }
          />
        </dl>

        {intent.note && (
          <div className="mt-4">
            <Note>{intent.note}</Note>
          </div>
        )}

        {intent.intent.timing === 'scheduled' && (
          <div className="mt-3">
            <Note tone="warn">
              We read a future date and we are not honouring it. KORA settles immediately in this
              build — scheduling is where &ldquo;earn until needed&rdquo; would live, parking
              eligible USDC in a Pollar Earn vault between funding and payout. The parser already
              produces the timestamp; the scheduler does not exist yet, so we say so rather than
              quietly paying now.
            </Note>
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-ink-600">
          The parser fills this object and stops. It cannot pick a corridor, produce a quote or
          move money — that is all deterministic code below, and it still needs your confirmation.
        </p>
      </Card>

      <div className="space-y-5">
        {resolution.status !== 'ready' && (
          <Card className="p-5">
            <SectionLabel>Cannot route this yet</SectionLabel>
            <p className="mt-3 text-sm leading-relaxed text-ink-200">{resolution.message}</p>
            {resolution.candidates.length > 0 && (
              <div className="mt-4 space-y-2">
                {resolution.candidates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border seam px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-ink-300">
                      <Flag code={c.country} size={14} />
                      {c.countryName} · {c.railLabel}
                    </span>
                    <ReadinessBadge readiness={c.readiness} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {quote && resolution.selected && (
          <Card leg="kora" className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel>Funding corridor</SectionLabel>
                <div className="mt-1.5 flex items-center gap-2 text-sm font-medium text-ink-100">
                  <Flag code={resolution.selected.country} size={16} />
                  {resolution.selected.countryName} · {resolution.selected.railLabel}
                </div>
              </div>
              <ReadinessBadge readiness={resolution.selected.readiness} />
            </div>

            {resolution.selected.readinessNote && (
              <p className="mt-3 text-xs leading-relaxed text-ink-500">
                {resolution.selected.readinessNote}
              </p>
            )}

            <div className="mt-5 border-t seam pt-4">
              <SectionLabel>Where every unit goes</SectionLabel>
              <div className="mt-2 divide-y divide-ink-800/60">
                {quote.quote.breakdown.map((line) => (
                  <Row key={line.label} label={line.label} note={line.note}>
                    <span
                      className={cx(
                        'tabular text-sm font-medium',
                        line.amount < 0 ? 'text-danger/80' : 'text-ink-100',
                      )}
                    >
                      {line.amount < 0 ? '−' : ''}
                      {Math.abs(line.amount).toLocaleString()} {line.currency}
                    </span>
                  </Row>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-flow-core/25 bg-flow-wash/40 p-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-xs text-flow-glow/80">Hands off to Pollar as</span>
                <Money amount={quote.quote.receiveUsdc} currency={SETTLEMENT_ASSET} size="md" />
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-flow-core/15 pt-2">
                <span className="text-xs text-flow-glow/80">
                  Recipient receives (Pollar&rsquo;s leg)
                </span>
                <span className="tabular text-sm font-semibold text-flow-glow">
                  ≈ Bs {quote.destinationEstimate.amount.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <Note>
                Rate 1 {SETTLEMENT_ASSET} = {quote.quote.rate.toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
                {quote.quote.currency} · {quote.quote.rateSource}. No markup is applied to the rate
                itself; KORA&rsquo;s margin is the spread line above.
              </Note>
            </div>

            <Button className="mt-5 w-full" onClick={onContinue} busy={busy}>
              Fund {quote.quote.amount.toLocaleString()} {quote.quote.currency}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}

function IntentRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-xs uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="text-right">
        <span className="text-sm text-ink-100">{value}</span>
        {hint && <span className="ml-2 text-[11px] text-flow-glow/70">{hint}</span>}
      </dd>
    </div>
  );
}

// ── Fund stage ────────────────────────────────────────────────────────────

function FundStage({
  funding,
  state,
  busy,
  onReport,
  onConfirm,
}: {
  funding: KoraFundingRequest;
  state: KoraFundingState;
  busy: boolean;
  onReport: () => void;
  onConfirm: () => void;
}) {
  const scannable = funding.instructions.scannable;

  return (
    <div className="grid gap-5 rise lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Card leg="kora" className="p-5">
        <SectionLabel>Pay from your local account</SectionLabel>

        {scannable && (
          <div className="mt-4 flex items-start gap-4 rounded-xl border seam bg-ink-950/60 p-4">
            <div
              className="h-24 w-24 shrink-0 text-ink-100 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: scannable.image.data }}
            />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-ink-500">
                {scannable.payloadLabel ?? 'Scan to pay'}
              </div>
              <div className="mt-1 break-all font-mono text-xs text-ink-200">
                {scannable.payload}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 divide-y divide-ink-800/60 rounded-xl border seam">
          {funding.instructions.fields.map((f) => (
            <div key={f.key} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
              <span className="text-xs text-ink-500">{f.label}</span>
              <span
                className={cx(
                  'text-right text-sm text-ink-100',
                  (f.type === 'code' || f.type === 'amount') && 'font-mono tabular',
                )}
              >
                {f.type === 'datetime' ? new Date(f.value).toLocaleTimeString() : f.value}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-600">
          These fields come back from the adapter in Pollar&rsquo;s own{' '}
          <code className="text-ink-400">depositInstructions</code> shape — labelled, typed and
          provider-agnostic. The same component renders a Pollar ramp and a KORA rail without
          knowing which produced it.
        </p>

        {state.status === 'awaiting_payment' && (
          <Button className="mt-5 w-full" onClick={onReport} busy={busy}>
            I&rsquo;ve sent the transfer
          </Button>
        )}
      </Card>

      <Card className="p-5">
        <SectionLabel>Settlement</SectionLabel>

        <ol className="mt-4 space-y-3">
          {state.events.map((event, i) => (
            <li key={`${event.at}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cx(
                    'mt-1 h-2 w-2 shrink-0 rounded-full',
                    event.status === 'funded' ? 'bg-live' : 'bg-amber-core',
                  )}
                />
                {i < state.events.length - 1 && <span className="mt-1 w-px flex-1 bg-ink-700" />}
              </div>
              <div className="min-w-0 pb-1">
                <div className="text-xs font-medium text-ink-200">
                  {event.status.replace(/_/g, ' ')}
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-ink-500">{event.detail}</div>
                <div className="mt-0.5 text-[10px] text-ink-600">
                  {new Date(event.at).toLocaleTimeString()}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {state.status === 'payment_reported' && (
          <div className="mt-5 space-y-3">
            <Note tone="warn">
              Reporting a transfer is a claim, not a settlement. The rail confirms it
              independently — which is why these are two different states.
            </Note>
            {funding.requiresOperatorConfirmation && (
              <Button variant="ghost" className="w-full" onClick={onConfirm} busy={busy}>
                Operator: confirm receipt
              </Button>
            )}
          </div>
        )}

        {funding.requiresOperatorConfirmation && state.status === 'awaiting_payment' && (
          <div className="mt-5">
            <Note>
              This rail has no programmatic callback, so a human confirms receipt against the bank
              statement. That step is shown rather than hidden — it is the honest shape of a
              semi-manual corridor.
            </Note>
          </div>
        )}
      </Card>
    </div>
  );
}
