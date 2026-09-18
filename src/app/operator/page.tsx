'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Flag } from '@/components/Flag';
import { Button, Note, SectionLabel, cx } from '@/components/ui';
import { confirmFunding } from '@/lib/client';
import type { KoraFundingRequest, KoraFundingState } from '@/lib/corridor/types';

interface Row {
  request: KoraFundingRequest;
  state: KoraFundingState;
  corridor: {
    id: string;
    country: string;
    countryName: string;
    railLabel: string;
    readiness: string;
  } | null;
}

interface Queue {
  rows: Row[];
  counts: { total: number; awaiting: number; reported: number; funded: number };
}

/**
 * The operator console.
 *
 * A rail with no programmatic callback needs a human to reconcile a bank
 * statement against a reference. Every real African collections operation has
 * this desk. Hiding it behind an auto-advancing timer would have made the demo
 * smoother and the design a lie, so it is a screen.
 */
export default function OperatorPage() {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/funding/pending', { cache: 'no-store' });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error ?? 'Could not load the queue.');
      setQueue(body.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the queue.');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  const confirm = useCallback(
    async (reference: string) => {
      setWorking(reference);
      try {
        await confirmFunding(reference);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not confirm.');
      } finally {
        setWorking(null);
      }
    },
    [load],
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <header className="flex items-center justify-between py-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          KORA
        </Link>
        <Link
          href="/"
          className="rounded-lg border seam px-3 py-1.5 text-xs text-ink-300 transition-colors hover:border-amber-core/30 hover:text-ink-100"
        >
          ← Back to the composer
        </Link>
      </header>

      <section className="pt-6 pb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Operator console</h1>
        <p className="mt-4 max-w-2xl text-pretty leading-relaxed text-ink-400">
          Nigerian bank transfers arrive without a programmatic callback, so someone has to match
          a bank statement against a reference. Every real African collections desk does this. It
          is a screen here rather than a hidden timer, because the semi-manual step is part of the
          design, not something to disguise.
        </p>
      </section>

      {queue && (
        <div className="mb-6 grid grid-cols-4 gap-3">
          <Stat label="Total" value={queue.counts.total} />
          <Stat label="Awaiting" value={queue.counts.awaiting} tone="ink" />
          <Stat label="Needs review" value={queue.counts.reported} tone="amber" />
          <Stat label="Funded" value={queue.counts.funded} tone="live" />
        </div>
      )}

      {error && (
        <div className="mb-6">
          <Note tone="warn">{error}</Note>
        </div>
      )}

      {queue && queue.rows.length === 0 && (
        <Note>
          Nothing in the queue. Start a payment on the composer and it will appear here the
          moment a funding request is created.
        </Note>
      )}

      <div className="space-y-3">
        {queue?.rows.map(({ request, state, corridor }) => (
          <div
            key={request.reference}
            className={cx(
              'rounded-2xl border bg-ink-900/50 p-4',
              state.status === 'payment_reported' ? 'border-amber-core/35' : 'seam',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {corridor && <Flag code={corridor.country} size={16} />}
                <span className="font-mono text-sm text-ink-100">{request.reference}</span>
                <StatusChip status={state.status} />
              </div>
              <span className="tabular text-sm font-semibold text-ink-100">
                {request.amount.toLocaleString()} {request.currency}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-500">
              <span>{corridor ? `${corridor.countryName} · ${corridor.railLabel}` : request.corridorId}</span>
              <span>→ {request.receiveUsdc.toFixed(2)} USDC</span>
              <span>{new Date(request.createdAt).toLocaleTimeString()}</span>
            </div>

            {state.status === 'payment_reported' && request.requiresOperatorConfirmation && (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t seam pt-3">
                <span className="text-xs text-ink-400">
                  Sender reports having transferred. Match it against the statement, then:
                </span>
                <Button
                  variant="ghost"
                  busy={working === request.reference}
                  onClick={() => confirm(request.reference)}
                >
                  Confirm receipt
                </Button>
              </div>
            )}

            {state.events.length > 1 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] text-ink-600 hover:text-ink-400">
                  {state.events.length} events
                </summary>
                <ol className="mt-2 space-y-1.5 border-l seam pl-3">
                  {state.events.map((e, i) => (
                    <li key={i} className="text-[11px] text-ink-500">
                      <span className="text-ink-300">{e.status.replace(/_/g, ' ')}</span> — {e.detail}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8">
        <SectionLabel>Note</SectionLabel>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-600">
          This console is unauthenticated and scoped to one server instance, which is fine for a
          hackathon and would not be in production: it belongs behind operator auth, scoped per
          country, with an audit trail on every confirmation. The point it makes is about the
          shape of the corridor, not the security of this page.
        </p>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: number;
  tone?: 'ink' | 'amber' | 'live';
}) {
  const colour =
    tone === 'amber' ? 'text-amber-glow' : tone === 'live' ? 'text-live' : 'text-ink-200';
  return (
    <div className="rounded-xl border seam bg-ink-900/50 p-3">
      <div className={cx('tabular text-2xl font-bold tracking-tight', colour)}>{value}</div>
      <div className="mt-0.5 text-[11px] text-ink-500">{label}</div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tones: Record<string, string> = {
    awaiting_payment: 'text-ink-400 seam',
    payment_reported: 'text-amber-glow border-amber-core/30',
    confirming: 'text-amber-glow border-amber-core/30',
    funded: 'text-live border-live/30',
    expired: 'text-ink-500 seam',
    failed: 'text-danger border-danger/30',
  };

  return (
    <span
      className={cx(
        'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        tones[status] ?? 'seam text-ink-400',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
