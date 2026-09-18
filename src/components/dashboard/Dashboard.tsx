'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Bell, Eye, EyeOff, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar, type PanelMode } from './Sidebar';
import { SpendChart } from './SpendChart';
import { AgentPanel, BeneficiaryPanel, SendPanel, useRates, type RatesPayload } from './panels';
import { CardLabel, DirectionMark, IconButton, Monogram } from './parts';
import { Flag } from '../Flag';
import {
  ACCOUNT,
  TRANSACTIONS,
  formatNaira,
  relativeDay,
  type DemoTransaction,
} from '@/lib/demo-data';

/**
 * The account dashboard.
 *
 * Follows the supplied reference layout, translated into the monochrome
 * system and rebased on the naira. Where the reference listed euro, sterling
 * and Swiss franc, this lists the African currencies KORA actually declares
 * corridors for, quoted against the naira from the same live feed the quote
 * engine uses.
 *
 * The right hand column is a workspace the rail switches: a manual send, the
 * agent, or the beneficiary book. All three end at the same review screen,
 * which is the real corridor engine.
 */
export function Dashboard() {
  const [mode, setMode] = useState<PanelMode>('send');
  const rates = useRates();

  return (
    <div className="min-h-screen bg-paper-edge p-0 lg:p-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] overflow-hidden border-rule bg-paper lg:min-h-0 lg:rounded-3xl lg:border lg:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-12px_rgba(0,0,0,0.10)]">
        <div className="hidden lg:flex">
          <Sidebar mode={mode} onSelect={setMode} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <Header />

          <div className="flex min-w-0 flex-1 flex-col xl:flex-row">
            <main className="min-w-0 flex-1 space-y-4 px-5 pb-8 sm:px-7">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="space-y-4">
                  <BalanceCard rates={rates} />
                  <CurrencyStrip rates={rates} />
                </div>

                <Transactions />
              </div>

              <SpendChart />
            </main>

            <section className="w-full shrink-0 border-t border-rule px-5 py-6 sm:px-7 xl:w-[360px] xl:border-l xl:border-t-0 xl:px-6">
              <MobileModeSwitch mode={mode} onSelect={setMode} />

              {mode === 'send' && <SendPanel rates={rates} />}
              {mode === 'agent' && <AgentPanel />}
              {mode === 'beneficiaries' && <BeneficiaryPanel />}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="flex items-center justify-between px-5 py-6 sm:px-7">
      <div className="min-w-0">
        <h1 className="truncate text-[26px] font-semibold tracking-[-0.025em] sm:text-[30px]">
          Hi, {ACCOUNT.firstName}
        </h1>
        <p className="mt-0.5 text-xs text-ink-faint">
          Paying contractors across Latin America from Lagos
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Link href="/corridors" className="hidden sm:block">
          <IconButton label="Corridor registry">
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.8} />
          </IconButton>
        </Link>
        <div className="relative">
          <IconButton label="Notifications">
            <Bell className="h-4 w-4" strokeWidth={1.8} />
          </IconButton>
          <span
            className="absolute right-1 top-1 h-2 w-2 rounded-full bg-ink ring-2 ring-paper"
            aria-hidden
          />
        </div>
        <Monogram name={ACCOUNT.fullName} size={40} className="ml-1 lg:hidden" />
      </div>
    </header>
  );
}

// ── Balance ───────────────────────────────────────────────────────────────

function BalanceCard({ rates }: { rates: RatesPayload | null }) {
  const [hidden, setHidden] = useState(false);

  return (
    <div className="rounded-2xl bg-ink p-5 text-paper">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Flag code="NG" size={15} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">NGN</span>
          </div>
          <div className="mt-1 text-[11px] text-paper/50">
            {rates
              ? `1 USD = ₦${rates.basePerUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : 'Loading rate'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setHidden((v) => !v)}
          aria-label={hidden ? 'Show balance' : 'Hide balance'}
          className="rounded-md p-1.5 text-paper/50 transition-colors hover:bg-paper/10 hover:text-paper"
        >
          {hidden ? (
            <Eye className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <EyeOff className="h-4 w-4" strokeWidth={1.8} />
          )}
        </button>
      </div>

      <div className="tabular mt-5 text-[38px] font-semibold leading-none tracking-[-0.035em]">
        {hidden ? '••••••••' : formatNaira(ACCOUNT.balance)}
      </div>
      <div className="tabular mt-2 text-sm text-paper/60">
        {hidden ? '•••••' : `${formatNaira(ACCOUNT.delta, { signed: true })} this month`}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-1 border-t border-paper/15 pt-4">
        <Action icon={<ArrowUpRight className="h-4 w-4" strokeWidth={1.8} />} label="Pay" />
        <Action icon={<Repeat className="h-4 w-4" strokeWidth={1.8} />} label="Convert" />
        <Action icon={<ArrowDownLeft className="h-4 w-4" strokeWidth={1.8} />} label="Receive" />
      </div>
    </div>
  );
}

function Action({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="flex flex-col items-center gap-1.5 rounded-lg py-1.5 text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-paper/25">
        {icon}
      </span>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

// ── Currency strip ────────────────────────────────────────────────────────

/**
 * The reference showed euro, sterling and franc. KORA is an African corridor
 * provider, so the currencies that matter here are the ones it declares
 * corridors for. Quoted per 1,000 naira: a single naira buys 0.0086 cedi,
 * which is accurate and unreadable.
 */
function CurrencyStrip({ rates }: { rates: RatesPayload | null }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">
          Per &#8358;1,000
        </span>
        {rates && (
          <span className="text-[10px] text-ink-ghost">
            {rates.stale ? 'cached rate' : 'live'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(rates?.rates ?? []).map((rate) => (
          <div key={rate.code} className="rounded-xl border border-rule p-3">
            <div className="flex items-center gap-1.5">
              <Flag code={rate.country} size={13} />
              <span className="text-[10px] font-medium text-ink-muted">{rate.code}</span>
            </div>
            <div className="tabular mt-2 text-[17px] font-semibold tracking-[-0.02em]">
              {rate.value.toLocaleString(undefined, {
                minimumFractionDigits: rate.value >= 1000 ? 0 : 2,
                maximumFractionDigits: rate.value >= 1000 ? 0 : 2,
              })}
            </div>
            <div className="truncate text-[10px] text-ink-faint">{rate.name}</div>
          </div>
        ))}

        {!rates &&
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[86px] animate-pulse rounded-xl border border-rule bg-paper-sunk" />
          ))}
      </div>
    </div>
  );
}

// ── Transactions ──────────────────────────────────────────────────────────

function Transactions() {
  return (
    <div className="rounded-2xl border border-rule p-5">
      <CardLabel
        action={
          <Link
            href="/operator"
            className="text-[11px] text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            View all
          </Link>
        }
      >
        Recent activity
      </CardLabel>

      <ul className="mt-3 divide-y divide-rule">
        {TRANSACTIONS.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} />
        ))}
      </ul>

      <p className="mt-4 border-t border-rule pt-3 text-[10px] leading-relaxed text-ink-faint">
        Sample account data, so the dashboard has something to show. The corridor engine,
        the rates and the payment flow behind Review are real.
      </p>
    </div>
  );
}

function TransactionRow({ tx }: { tx: DemoTransaction }) {
  const outgoing = tx.direction === 'out';

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Monogram name={tx.party} kind={tx.kind} size={36} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{tx.party}</div>
        <div className="truncate text-[11px] text-ink-faint">
          {tx.detail} &middot; {relativeDay(tx.at)}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className={cn('tabular text-[13px] font-semibold', outgoing && 'text-ink-muted')}>
          {formatNaira(tx.amount, { signed: true })}
        </span>
        <DirectionMark direction={tx.direction} />
      </div>
    </li>
  );
}

// ── Mode switch for narrow screens, which have no rail ────────────────────

function MobileModeSwitch({
  mode,
  onSelect,
}: {
  mode: PanelMode;
  onSelect: (mode: PanelMode) => void;
}) {
  const options: { mode: PanelMode; label: string }[] = [
    { mode: 'send', label: 'Send' },
    { mode: 'agent', label: 'Kora Agent' },
    { mode: 'beneficiaries', label: 'Beneficiaries' },
  ];

  return (
    <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-rule p-1 lg:hidden">
      {options.map((option) => (
        <button
          key={option.mode}
          type="button"
          onClick={() => onSelect(option.mode)}
          className={cn(
            'rounded-lg py-2 text-[11px] font-medium transition-colors',
            mode === option.mode ? 'bg-ink text-paper' : 'text-ink-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
