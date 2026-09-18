'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Bell, Eye, EyeOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar, PANEL_TITLES, type PanelMode } from './Sidebar';
import { SpendChart } from './SpendChart';
import {
  AgentPanel,
  BeneficiaryPanel,
  ReceivePanel,
  SendPanel,
  useBalance,
  useRates,
  type BalancePayload,
  type RatesPayload,
} from './panels';
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
  const { balance, refresh } = useBalance();

  const open = (next: PanelMode | null) => setPanel(next);

  return (
    /*
     * The card floats on the canvas rather than filling it.
     *
     * Centred on both axes, with `my-auto` rather than `items-center` doing
     * the vertical half. They look the same until the card is taller than the
     * window, and then `items-center` overflows in both directions and puts
     * the top of the dashboard somewhere you cannot scroll to. Auto margins
     * collapse instead, so a tall card simply starts at the top.
     */
    <div className="canvas flex min-h-screen justify-center p-0 lg:p-6 xl:p-9 2xl:p-14">
      <div className="surface my-auto flex min-h-screen w-full max-w-[1240px] overflow-hidden border-rule lg:min-h-0 lg:rounded-[28px] lg:border lg:shadow-[0_2px_4px_rgba(15,17,16,0.04),0_24px_60px_-20px_rgba(15,17,16,0.18)]">
        <div className="hidden lg:flex">
          <Sidebar panel={panel} onSelect={open} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <Header />

          <div className="flex min-w-0 flex-1 flex-col xl:flex-row">
            <main className="min-w-0 flex-1 space-y-4 px-5 pb-8 sm:px-7">
              {panel === null && <PanelTriggers onSelect={open} />}

              <div
                className={cn(
                  'grid gap-4',
                  panel === null
                    ? 'lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]'
                    : 'lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]',
                )}
              >
                <div className="min-w-0 space-y-4">
                  <BalanceCard
                    rates={rates}
                    balance={balance}
                    onPay={() => open('send')}
                    onReceive={() => open('receive')}
                  />
                  <SpendChart />
                </div>

                <div className="min-w-0">
                  <Transactions />
                </div>
              </div>
            </main>

            {panel !== null && (
              <PanelFrame title={PANEL_TITLES[panel]} onClose={() => open(null)}>
                {panel === 'send' && <SendPanel rates={rates} balance={balance} />}
                {panel === 'agent' && <AgentPanel />}
                {panel === 'beneficiaries' && <BeneficiaryPanel />}
                {panel === 'receive' && <ReceivePanel onCredited={refresh} />}
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
      className="rise w-full shrink-0 border-t border-rule bg-paper px-5 py-6 sm:px-7 xl:w-[360px] xl:border-l xl:border-t-0 xl:px-6"
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

/**
 * The balance card.
 *
 * Two surfaces in one object, from the reference: the money sits on the brand
 * yellow, and the things you can do with it sit on white underneath. That
 * split is doing work rather than decoration. Everything on the yellow is a
 * statement about what you have; everything on the white is a button that
 * changes it, and putting the two on the same fill made the actions read as
 * more numbers.
 *
 * Centred, because the card has one subject. The old left alignment came from
 * a layout with a second column that no longer exists.
 */
function BalanceCard({
  rates,
  balance,
  onPay,
  onReceive,
}: {
  rates: RatesPayload | null;
  balance: BalancePayload | null;
  onPay: () => void;
  onReceive: () => void;
}) {
  const [hidden, setHidden] = useState(false);

  return (
    <div className="min-w-0 overflow-hidden rounded-[24px] border border-rule bg-paper p-1.5 shadow-[0_1px_2px_rgba(15,17,16,0.04)]">
      <div className="relative rounded-[18px] bg-accent px-5 pb-6 pt-5 text-center text-ink">
        <button
          type="button"
          onClick={() => setHidden((v) => !v)}
          aria-label={hidden ? 'Show balance' : 'Hide balance'}
          className="absolute right-3 top-3 rounded-md p-1.5 text-ink/45 transition-colors hover:bg-ink/10 hover:text-ink"
        >
          {hidden ? (
            <Eye className="h-4 w-4" strokeWidth={1.8} />
          ) : (
            <EyeOff className="h-4 w-4" strokeWidth={1.8} />
          )}
        </button>

        <div className="flex items-center justify-center gap-2">
          <Flag code={ACCOUNT.country} size={15} />
          <span className="text-[13px] font-semibold tracking-[0.02em]">
            {ACCOUNT.currency}
          </span>
        </div>

        <div className="mt-1 text-[11px] text-ink/55">
          {rates
            ? `1 USD = ₦${rates.basePerUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : 'Loading rate'}
        </div>

        <div className="tabular mt-4 truncate text-[32px] font-bold leading-none tracking-[-0.04em] sm:text-[38px]">
          {hidden ? '••••••••' : formatNaira(balance?.balance ?? ACCOUNT.balance)}
        </div>

        <div className="tabular mt-2 truncate text-[13px] text-ink/60">
          {hidden
            ? '•••••'
            : balance && balance.movements !== 0
              ? // Once something real has landed, say so rather than leaving the
                // sample monthly figure to take the credit for it.
                `${formatNaira(balance.movements, { signed: true })} since you opened this`
              : `${formatNaira(ACCOUNT.delta, { signed: true })} this month`}
        </div>
      </div>

      <div className="relative grid grid-cols-2">
        {/*
          * Drawn rather than left to `divide-x`, which can only run the full
          * height of the row. Inset a tenth top and bottom so the rule
          * separates the two actions without reaching for the edges of the
          * card and turning into structure.
          */}
        <span
          aria-hidden
          className="absolute left-1/2 top-[10%] h-[80%] w-px -translate-x-1/2 bg-rule"
        />

        <Action
          icon={<ArrowUpRight className="h-[15px] w-[15px]" strokeWidth={2} />}
          label="Pay"
          onClick={onPay}
        />
        <Action
          icon={<ArrowDownLeft className="h-[15px] w-[15px]" strokeWidth={2} />}
          label="Receive"
          onClick={onReceive}
        />
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
      className="group flex flex-col items-center gap-2 py-4 transition-colors hover:bg-paper-sunk"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-rule text-ink-soft transition-colors group-hover:border-ink group-hover:bg-ink group-hover:text-paper">
        {icon}
      </span>
      <span className="text-[11px] font-medium text-ink-muted transition-colors group-hover:text-ink">
        {label}
      </span>
    </button>
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
