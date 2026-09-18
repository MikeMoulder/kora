'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Bell, Eye, EyeOff, Repeat, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar, PANEL_TITLES, type PanelMode } from './Sidebar';
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
 * Follows the supplied reference layout, translated into the KORA system and
 * rebased on the naira. Where the reference listed euro, sterling and Swiss
 * franc, this lists the African currencies KORA actually declares corridors
 * for, quoted against the naira from the same live feed the quote engine uses.
 *
 * Overview is the resting state and owns the full width: balance, rates,
 * activity and spend. Nothing is composed until somebody asks for it, so the
 * workspace panel stays closed until the rail, or Pay on the balance card,
 * opens it. All three panels end at the same review screen, which is the real
 * corridor engine.
 */
export function Dashboard() {
  const [panel, setPanel] = useState<PanelMode | null>(null);
  const rates = useRates();

  return (
    <div className="canvas min-h-screen p-0 lg:p-6 xl:p-9 2xl:p-14">
      <div className="mx-auto flex min-h-screen w-full max-w-[1320px] overflow-hidden border-rule bg-paper lg:min-h-0 lg:rounded-[28px] lg:border lg:shadow-[0_2px_4px_rgba(15,17,16,0.04),0_24px_60px_-20px_rgba(15,17,16,0.18)]">
        <div className="hidden lg:flex">
          <Sidebar panel={panel} onSelect={setPanel} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <Header />

          <div className="flex min-w-0 flex-1 flex-col xl:flex-row">
            <main className="min-w-0 flex-1 space-y-4 px-5 pb-8 sm:px-7">
              {panel === null && <PanelTriggers onSelect={setPanel} />}

              <div
                className={cn(
                  'grid gap-4',
                  panel === null
                    ? 'lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]'
                    : 'lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]',
                )}
              >
                <div className="min-w-0 space-y-4">
                  <BalanceCard rates={rates} onPay={() => setPanel('send')} />
                  <CurrencyStrip rates={rates} />
                </div>

                <div className="min-w-0">
                  <Transactions />
                </div>
              </div>

              <SpendChart />
            </main>

            {panel !== null && (
              <PanelFrame title={PANEL_TITLES[panel]} onClose={() => setPanel(null)}>
                {panel === 'send' && <SendPanel rates={rates} />}
                {panel === 'agent' && <AgentPanel />}
                {panel === 'beneficiaries' && <BeneficiaryPanel />}
              </PanelFrame>
            )}
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

// ── Workspace panel ───────────────────────────────────────────────────────

/**
 * The frame around whichever workspace the rail opened.
 *
 * It carries the title and the way out. A panel that can be opened has to be
 * closable from inside it, because the rail that opened it is not on screen
 * below the `lg` breakpoint.
 */
function PanelFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rise w-full shrink-0 border-t border-rule px-5 py-6 sm:px-7 xl:w-[360px] xl:border-l xl:border-t-0 xl:px-6"
    >
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={'Close ' + title}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-paper-sunk hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>

      {children}
    </section>
  );
}

/**
 * The rail is hidden below `lg`, so narrow screens need their own way into
 * the three workspaces. Shown only while the overview is at rest, since an
 * open panel carries its own close.
 */
function PanelTriggers({ onSelect }: { onSelect: (panel: PanelMode) => void }) {
  const modes: PanelMode[] = ['send', 'agent', 'beneficiaries'];

  return (
    <div className="grid grid-cols-3 gap-2 lg:hidden">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onSelect(mode)}
          className="rounded-xl border border-rule py-2.5 text-[11px] font-medium text-ink-muted transition-colors hover:border-ink hover:text-ink"
        >
          {PANEL_TITLES[mode]}
        </button>
      ))}
    </div>
  );
}

// ── Balance ───────────────────────────────────────────────────────────────

function BalanceCard({
  rates,
  onPay,
}: {
  rates: RatesPayload | null;
  onPay: () => void;
}) {
  const [hidden, setHidden] = useState(false);

  return (
    <div className="min-w-0 rounded-2xl bg-accent p-5 text-ink">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Flag code="NG" size={15} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">NGN</span>
          </div>
          <div className="mt-1 text-[11px] text-ink/55">
            {rates
              ? `1 USD = ₦${rates.basePerUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : 'Loading rate'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setHidden((v) => !v)}
          aria-label={hidden ? 'Show balance' : 'Hide balance'}
          className="shrink-0 rounded-md p-1.5 text-ink/50 transition-colors hover:bg-ink/10 hover:text-ink"
        >
          {hidden ? (
            <Eye className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <EyeOff className="h-4 w-4" strokeWidth={1.8} />
          )}
        </button>
      </div>

      <div className="tabular mt-5 truncate text-[30px] font-semibold leading-none tracking-[-0.035em] sm:text-[36px]">
        {hidden ? '••••••••' : formatNaira(ACCOUNT.balance)}
      </div>
      <div className="tabular mt-2 truncate text-sm text-ink/60">
        {hidden ? '•••••' : `${formatNaira(ACCOUNT.delta, { signed: true })} this month`}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-1 border-t border-ink/15 pt-4">
        <Action
          icon={<ArrowUpRight className="h-4 w-4" strokeWidth={1.8} />}
          label="Pay"
          onClick={onPay}
        />
        <Action icon={<Repeat className="h-4 w-4" strokeWidth={1.8} />} label="Convert" />
        <Action icon={<ArrowDownLeft className="h-4 w-4" strokeWidth={1.8} />} label="Receive" />
      </div>
    </div>
  );
}

function Action({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-lg py-1.5 text-ink/75 transition-colors hover:bg-ink/10 hover:text-ink"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/25 bg-paper/40">
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

/**
 * Recent activity.
 *
 * The reference gives every transaction its own card rather than ruling one
 * block into rows, and it is the better reading of the data: each line is a
 * separate event with its own counterparty and its own direction, so nothing
 * is gained by binding them into a single object. Separated cards also let a
 * row be hovered, and later opened, without the list shifting.
 */
function Transactions() {
  return (
    <div>
      <div className="px-1">
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
      </div>

      <ul className="mt-3 space-y-2">
        {TRANSACTIONS.map((tx) => (
          <TransactionRow key={tx.id} tx={tx} />
        ))}
      </ul>
    </div>
  );
}

function TransactionRow({ tx }: { tx: DemoTransaction }) {
  const outgoing = tx.direction === 'out';

  return (
    <li className="flex items-center gap-3 rounded-xl border border-rule bg-paper px-4 py-3 shadow-[0_1px_2px_rgba(15,17,16,0.03)] transition-colors hover:border-ink-ghost">
      <Monogram name={tx.party} kind={tx.kind} size={38} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{tx.party}</div>
        <div className="truncate text-[11px] text-ink-faint">
          {tx.detail} &middot; {relativeDay(tx.at)}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            'tabular text-[13px] font-semibold',
            outgoing ? 'text-loss' : 'text-gain',
          )}
        >
          {formatNaira(tx.amount, { signed: true })}
        </span>
        <DirectionMark direction={tx.direction} />
      </div>
    </li>
  );
}
