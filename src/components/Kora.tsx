'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Composer } from './Composer';
import { Flag } from './Flag';
import { RouteRail, RouteLegend, type RouteNode } from './RouteRail';
import { Handoff } from './Handoff';
import {
  Button,
  Money,
  Note,
  OwnerTag,
  Panel,
  ReadinessBadge,
  Row,
  Rule,
  SectionLabel,
  cn,
} from './ui/primitives';
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

export function Kora({ initialIntent }: { initialIntent?: string } = {}) {
  const [stage, setStage] = useState<Stage>('compose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [funding, setFunding] = useState<KoraFundingRequest | null>(null);
  const [fundingState, setFundingState] = useState<KoraFundingState | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

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

      setQuote(await getQuote(parsed.resolution.selected.id, parsed.intent.amount!));
      setStage('plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that.');
    } finally {
      setBusy(false);
    }
  }, []);

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
        events: [
          { at: request.createdAt, status: request.status, detail: 'Funding request created.' },
        ],
      });
      setStage('fund');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the funding request.');
    } finally {
      setBusy(false);
    }
  }, [intent, quote]);

  // A sentence arriving from the dashboard runs itself, so the person does
  // not have to retype what they already said. Guarded by a ref because a
  // second run would fire a duplicate parse on every re-render.
  const autoRan = useRef(false);

  useEffect(() => {
    if (autoRan.current || !initialIntent) return;
    autoRan.current = true;
    void onCompose(initialIntent);
  }, [initialIntent, onCompose]);

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
        // Transient. The next tick retries and the operator can confirm by hand.
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
    <div className="min-h-screen bg-paper">
      <Header />

      <main className="mx-auto w-full max-w-4xl px-5 pb-24 sm:px-6">
        {stage === 'compose' ? (
          <Hero>
            <Composer onSubmit={onCompose} busy={busy} error={error} />
          </Hero>
        ) : (
          <div className="pt-8">
            <button
              onClick={reset}
              className="mb-7 text-xs text-ink-faint transition-colors hover:text-ink"
            >
              &larr; Start over
            </button>
          </div>
        )}

        {stage !== 'compose' && (
          <section className="mb-9">
            <SectionLabel>Route</SectionLabel>
            <div className="mt-3 lg:-mx-10 xl:-mx-16">
              <RouteRail nodes={nodes} />
            </div>
            <RouteLegend />
          </section>
        )}

        {error && stage !== 'compose' && (
          <div className="mb-6">
            <Note tone="strong">{error}</Note>
          </div>
        )}

        {stage === 'plan' && intent && (
          <PlanStage intent={intent} quote={quote} busy={busy} onContinue={onCreateFunding} />
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
    </div>
  );
}

// ---- Route nodes --------------------------------------------------------

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
        owner: 'ours',
        state: stage === 'compose' ? 'idle' : 'done',
      },
      {
        key: 'rail',
        title: corridor?.rail ?? 'Local rail',
        subtitle: corridor ? `KORA, ${corridor.readiness}` : undefined,
        owner: 'ours',
        state: funded
          ? 'done'
          : reported || stage === 'fund'
            ? 'active'
            : stage === 'compose' || stage === 'plan'
              ? 'idle'
              : 'done',
      },
      {
        key: 'asset',
        title: SETTLEMENT_ASSET,
        value: quote ? quote.quote.receiveUsdc.toFixed(2) : undefined,
        subtitle: 'Hand-off asset',
        owner: 'ours',
        state: funded ? 'done' : 'idle',
      },
      {
        key: 'pollar',
        title: 'Pollar',
        subtitle: txHash ? 'Transfer confirmed' : 'Stellar testnet',
        owner: 'theirs',
        state: txHash ? 'done' : stage === 'handoff' ? 'active' : 'idle',
      },
      {
        key: 'recipient',
        countryCode: intent?.intent.destinationCountry ?? 'BO',
        title: intent?.intent.recipientName ?? 'Recipient',
        value: quote ? `Bs ${quote.destinationEstimate.amount.toLocaleString()}` : undefined,
        owner: 'simulated',
        state: txHash ? 'done' : 'idle',
        tag: 'Simulated',
      },
    ];
  }, [stage, intent, quote, fundingState, txHash]);
}

// ---- Chrome -------------------------------------------------------------

function Header() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink">
            <Image
              src="/kora-mark.png"
              alt=""
              width={560}
              height={489}
              className="h-[13px]"
              style={{ width: 'auto' }}
            />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">KORA</span>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink href="/">Dashboard</NavLink>
          <NavLink href="/corridors">Corridors</NavLink>
          <NavLink href="/operator">Operator</NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-paper-sunk hover:text-ink"
    >
      {children}
    </Link>
  );
}

function Hero({ children }: { children: React.ReactNode }) {
  return (
    <section className="pt-14 pb-10 sm:pt-20">
      <h1 className="text-balance text-[44px] font-semibold leading-[0.98] tracking-[-0.035em] sm:text-[64px]">
        Money,
        <br />
        <span className="text-ink-ghost">without borders.</span>
      </h1>
      <p className="mt-6 max-w-xl text-pretty text-[15px] leading-relaxed text-ink-muted">
        Pollar ramps fiat into Brazil, Colombia, Mexico and Bolivia. It has no African
        corridor. KORA is that corridor, written to Pollar&rsquo;s own adapter contract, so the
        hand-off is native rather than bolted on.
      </p>
      <div className="mt-9">{children}</div>
    </section>
  );
}

function ThesisStrip() {
  const items = [
    {
      n: '6',
      label: 'rails in Pollar’s enum',
      body: 'SPEI, PIX, PSE, ACH, BREB, QR. Every one of them Latin American.',
      owner: 'theirs' as const,
    },
    {
      n: '0',
      label: 'African corridors',
      body: 'Pollar’s ramp registry covers BR, CO, MX and BO. Africa is absent.',
      owner: 'simulated' as const,
    },
    {
      n: '5',
      label: 'rails KORA adds',
      body: 'NIP, M-Pesa, MoMo, P2P and cash agents, behind one adapter interface.',
      owner: 'ours' as const,
    },
  ];

  return (
    <section className="mt-16 border-t border-rule pt-10">
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.label}
            className={cn(
              'rounded-xl p-5',
              item.owner === 'ours' && 'leg-ours',
              item.owner === 'theirs' && 'leg-theirs',
              item.owner === 'simulated' && 'leg-simulated',
            )}
          >
            <div className="tabular text-[40px] font-semibold leading-none tracking-[-0.04em]">
              {item.n}
            </div>
            <div className="mt-2.5 text-sm font-medium">{item.label}</div>
            <p
              className={cn(
                'mt-2 text-xs leading-relaxed',
                item.owner === 'ours' ? 'text-paper/60' : 'text-ink-muted',
              )}
            >
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- Plan ---------------------------------------------------------------

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
    <div className="rise grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Panel className="p-5">
        <div className="flex items-center justify-between">
          <SectionLabel>Payment intent</SectionLabel>
          <span className="rounded-md border border-rule px-2 py-[3px] text-[11px] font-medium text-ink-muted">
            {intent.source === 'gemini' ? 'Gemini and rules' : 'Rule parser'}
          </span>
        </div>

        <dl className="mt-4">
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
            <Note tone="simulated">
              We read a future date and we are not honouring it. KORA settles immediately in
              this build. Scheduling is where earn until needed would live, parking eligible
              USDC in a Pollar Earn vault between funding and payout. The parser already
              produces the timestamp, the scheduler does not exist yet, so we say so rather
              than quietly paying now.
            </Note>
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
          The parser fills this object and stops. It cannot pick a corridor, produce a quote
          or move money. That is all deterministic code below, and it still needs your
          confirmation.
        </p>
      </Panel>

      <div className="space-y-5">
        {resolution.status !== 'ready' && (
          <Panel className="p-5">
            <SectionLabel>Cannot route this yet</SectionLabel>
            <p className="mt-3 text-sm leading-relaxed">{resolution.message}</p>
            {resolution.candidates.length > 0 && (
              <div className="mt-4 space-y-2">
                {resolution.candidates.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-rule px-3 py-2"
                  >
                    <span className="flex items-center gap-2 text-sm text-ink-soft">
                      <Flag code={c.country} size={14} />
                      {c.countryName}, {c.railLabel}
                    </span>
                    <ReadinessBadge readiness={c.readiness} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {quote && resolution.selected && (
          <Panel className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel>Funding corridor</SectionLabel>
                <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                  <Flag code={resolution.selected.country} size={15} />
                  {resolution.selected.countryName}, {resolution.selected.railLabel}
                </div>
              </div>
              <ReadinessBadge readiness={resolution.selected.readiness} />
            </div>

            {resolution.selected.readinessNote && (
              <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                {resolution.selected.readinessNote}
              </p>
            )}

            <div className="mt-5 border-t border-rule pt-4">
              <SectionLabel>Where every unit goes</SectionLabel>
              <div className="mt-1 divide-y divide-rule">
                {quote.quote.breakdown.map((line) => (
                  <Row key={line.label} label={line.label} note={line.note}>
                    <span className="tabular text-sm font-medium">
                      {line.amount < 0 ? '−' : ''}
                      {Math.abs(line.amount).toLocaleString()} {line.currency}
                    </span>
                  </Row>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <div className="leg-ours flex items-baseline justify-between gap-4 rounded-lg px-4 py-3">
                <span className="text-xs text-paper/70">Hands off to Pollar as</span>
                <Money amount={quote.quote.receiveUsdc} currency={SETTLEMENT_ASSET} />
              </div>
              <div className="leg-simulated flex items-baseline justify-between gap-4 rounded-lg px-4 py-3">
                <span className="text-xs">Recipient receives, Pollar&rsquo;s leg</span>
                <span className="tabular text-sm font-semibold">
                  &asymp; Bs {quote.destinationEstimate.amount.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <Note>
                Rate 1 {SETTLEMENT_ASSET} ={' '}
                {quote.quote.rate.toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
                {quote.quote.currency}, {quote.quote.rateSource}. No markup is applied to the
                rate itself. KORA&rsquo;s margin is the spread line above.
              </Note>
            </div>

            <Button className="mt-5 w-full" onClick={onContinue} busy={busy}>
              Fund {quote.quote.amount.toLocaleString()} {quote.quote.currency}
            </Button>
          </Panel>
        )}
      </div>
    </div>
  );
}

function IntentRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5 last:border-0">
      <dt className="text-xs uppercase tracking-[0.08em] text-ink-faint">{label}</dt>
      <dd className="text-right">
        <span className="text-sm">{value}</span>
        {hint && <span className="ml-2 text-[11px] text-ink-muted">{hint}</span>}
      </dd>
    </div>
  );
}

// ---- Fund ---------------------------------------------------------------

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
    <div className="rise grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Panel className="p-5">
        <div className="flex items-center justify-between">
          <SectionLabel>Pay from your local account</SectionLabel>
          <OwnerTag owner="ours">KORA</OwnerTag>
        </div>

        {scannable && (
          <div className="mt-4 flex items-start gap-4 rounded-lg border border-rule bg-paper-sunk p-4">
            <div
              className="h-24 w-24 shrink-0 text-ink [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: scannable.image.data }}
            />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                {scannable.payloadLabel ?? 'Scan to pay'}
              </div>
              <div className="mt-1 break-all font-mono text-xs">{scannable.payload}</div>
            </div>
          </div>
        )}

        <div className="mt-4 divide-y divide-rule rounded-lg border border-rule">
          {funding.instructions.fields.map((f) => (
            <div key={f.key} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
              <span className="text-xs text-ink-muted">{f.label}</span>
              <span
                className={cn(
                  'text-right text-sm',
                  (f.type === 'code' || f.type === 'amount') && 'tabular font-mono',
                )}
              >
                {f.type === 'datetime' ? new Date(f.value).toLocaleTimeString() : f.value}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          These fields come back from the adapter in Pollar&rsquo;s own{' '}
          <code className="text-ink-muted">depositInstructions</code> shape: labelled, typed
          and provider agnostic. The same component renders a Pollar ramp and a KORA rail
          without knowing which produced it.
        </p>

        {state.status === 'awaiting_payment' && (
          <Button className="mt-5 w-full" onClick={onReport} busy={busy}>
            I&rsquo;ve sent the transfer
          </Button>
        )}
      </Panel>

      <Panel className="p-5">
        <SectionLabel>Settlement</SectionLabel>

        <ol className="mt-4 space-y-3">
          {state.events.map((event, i) => (
            <li key={`${event.at}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'mt-1 h-2 w-2 shrink-0 rounded-full',
                    event.status === 'funded' ? 'bg-ink' : 'border border-ink bg-paper',
                  )}
                />
                {i < state.events.length - 1 && <span className="mt-1 w-px flex-1 bg-rule" />}
              </div>
              <div className="min-w-0 pb-1">
                <div className="text-xs font-medium">{event.status.replace(/_/g, ' ')}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-ink-muted">{event.detail}</div>
                <div className="mt-0.5 text-[10px] text-ink-faint">
                  {new Date(event.at).toLocaleTimeString()}
                </div>
              </div>
            </li>
          ))}
        </ol>

        {state.status === 'payment_reported' && (
          <div className="mt-5 space-y-3">
            <Note>
              Reporting a transfer is a claim, not a settlement. The rail confirms it
              independently, which is why these are two different states.
            </Note>
            {funding.requiresOperatorConfirmation && (
              <Button variant="outline" className="w-full" onClick={onConfirm} busy={busy}>
                Operator: confirm receipt
              </Button>
            )}
          </div>
        )}

        {funding.requiresOperatorConfirmation && state.status === 'awaiting_payment' && (
          <>
            <Rule className="my-5" />
            <Note>
              This rail has no programmatic callback, so a human confirms receipt against the
              bank statement. That step is shown rather than hidden. It is the honest shape of
              a semi manual corridor.
            </Note>
          </>
        )}
      </Panel>
    </div>
  );
}
