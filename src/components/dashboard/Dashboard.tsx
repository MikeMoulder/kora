'use client';

import { useCallback, useState } from 'react';
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
  useActivity,
  useBalance,
  useRates,
  type BalancePayload,
  type RatesPayload,
  type SendDraft,
} from './panels';
import { Avatar, CardLabel, IconButton } from './parts';
import { Flag } from '../Flag';
import { ACCOUNT, formatNaira, relativeDay } from '@/lib/demo-data';
import { RECENT_LIMIT, type ActivityItem, type ActivityPayload } from '@/lib/account/activity';

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
  const [draft, setDraft] = useState<SendDraft | null>(null);
  const rates = useRates();
  const { balance, refresh: refreshBalance } = useBalance();
  const { activity, refresh: refreshActivity } = useActivity();

  /*
   * A send moves the balance and writes a row, so both have to be re-read.
   * Refreshing only the balance left the money gone from the card and the
   * payment missing from the list beside it, which reads as a bug in the
   * corridor rather than a stale fetch.
   */
  const refresh = useCallback(() => {
    void refreshBalance();
    void refreshActivity();
  }, [refreshBalance, refreshActivity]);

  /**
   * Opening a panel by hand clears any draft. A set of fields composed ten
   * minutes ago by the agent should not reappear under a send somebody
   * started themselves.
   */
  const open = (next: PanelMode | null) => {
    setDraft(null);
    setPanel(next);
  };

  /** Kora Agent and the beneficiary book both land here. */
  const compose = (next: SendDraft) => {
    setDraft(next);
    setPanel('send');
  };

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
      <div className="surface card-app my-auto flex min-h-screen w-full max-w-[1240px] overflow-hidden lg:min-h-0">
        <div className="hidden lg:flex">
          <Sidebar panel={panel} onSelect={open} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <Header />

          <div className="flex min-w-0 flex-1 flex-col xl:flex-row">
            <main className="min-w-0 flex-1 space-y-4 px-5 pb-8 sm:px-7">
              {panel === null && <PanelTriggers onSelect={open} />}

              {/*
                * Two rows rather than two columns.
                *
                * What you have and who you paid sit side by side, because they
                * answer each other: the balance is the figure, the list is
                * where it went. Spend runs underneath across the whole width,
                * because a year of columns is a shape and a shape needs
                * length. It spent a while in the left column at a third of
                * this width, which is what made a dot matrix of a year look
                * like a barcode.
                */}
              <div
                className={cn(
                  'grid gap-4',
                  panel === null
                    ? 'lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]'
                    : 'lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]',
                )}
              >
                <BalanceCard
                  rates={rates}
                  balance={balance}
                  onPay={() => open('send')}
                  onReceive={() => open('receive')}
                />

                <Transactions activity={activity} />
              </div>

              <SpendChart activity={activity} />
            </main>

            {panel !== null && (
              <PanelFrame title={PANEL_TITLES[panel]} onClose={() => open(null)}>
                {panel === 'send' && (
                  <SendPanel
                    rates={rates}
                    balance={balance}
                    draft={draft}
                    onSent={refresh}
                  />
                )}
                {panel === 'agent' && <AgentPanel onCompose={compose} />}
                {panel === 'beneficiaries' && <BeneficiaryPanel onCompose={compose} />}
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
        <div className="relative">
          <IconButton label="Notifications">
            <Bell className="h-4 w-4" strokeWidth={1.8} />
          </IconButton>
          <span
            className="absolute right-1 top-1 h-2 w-2 rounded-full bg-ink ring-2 ring-paper"
            aria-hidden
          />
        </div>
        <Avatar
          id={ACCOUNT.avatarId}
          name={ACCOUNT.fullName}
          size={40}
          className="ml-1 lg:hidden"
        />
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
    <div className="card-block flex min-w-0 flex-col overflow-hidden rounded-[22px] bg-paper p-1.5">
      {/*
        * Concentric with the card around it: 22px outer radius less the 6px of
        * padding is 16px inner. Anything else leaves the gap between the two
        * curves widening through the corner, which is the thing that makes a
        * card-inside-a-card look glued together rather than nested.
        */}
      <div className="relative flex flex-1 flex-col justify-center rounded-[16px] bg-accent px-5 pb-6 pt-5 text-center text-ink">
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

        <Change24h balance={balance} hidden={hidden} />
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


/**
 * How the balance moved in the last day, as a percentage.
 *
 * A percentage rather than an amount, because the figure it is a percentage
 * of is the one thing on this card that is honest: the balance. A naira delta
 * invites you to read it as income, and most of what moves this account is
 * money passing through on its way somewhere else.
 *
 * Three states, deliberately distinct. A real change, a flat day, and no
 * answer yet. Rendering the third as "0.00%" would invent a fact, so it says
 * so instead.
 */
function Change24h({
  balance,
  hidden,
}: {
  balance: BalancePayload | null;
  hidden: boolean;
}) {
  if (hidden) {
    return <div className="tabular mt-2 truncate text-[13px] text-ink/60">•••••</div>;
  }

  if (!balance || balance.change24hPercent === null) {
    return (
      <div className="mt-2 truncate text-[13px] text-ink/50">
        No change to measure yet
      </div>
    );
  }

  const percent = balance.change24hPercent;
  const up = percent > 0;
  const flat = percent === 0;

  return (
    <div className="mt-2 flex items-center justify-center gap-1.5 text-[13px] text-ink/60">
      {!flat && (
        <span
          aria-hidden
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded-full',
            up ? 'bg-ink/10 text-ink' : 'bg-loss/15 text-loss',
          )}
        >
          {up ? (
            <ArrowUpRight className="h-2.5 w-2.5" strokeWidth={2.6} />
          ) : (
            <ArrowDownLeft className="h-2.5 w-2.5" strokeWidth={2.6} />
          )}
        </span>
      )}
      <span className="tabular font-medium">
        {up ? '+' : ''}
        {percent.toFixed(2)}%
      </span>
      <span className="text-ink/45">past 24h</span>
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

// ── Transactions ───────────────────────────────────────────────────

/**
 * Recent transactions.
 *
 * Every transaction gets its own card rather than one block ruled into rows,
 * which is the reference's reading of the data and the better one: each line
 * is a separate event with its own counterparty and its own direction, so
 * nothing is gained by binding them together. Separated cards also let a row
 * be hovered without the list shifting.
 *
 * Three columns and nothing else. Portrait, who and what happened, how much.
 * The direction badge that used to sit on the right is gone: the sign and the
 * colour already say which way the money went, and a third marker saying it
 * again was taking the space the amount wanted.
 */
function Transactions({ activity }: { activity: ActivityPayload | null }) {
  const rows = activity?.transactions ?? null;

  return (
    <div className="flex h-full min-w-0 flex-col">
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
          Recent transactions
        </CardLabel>
      </div>

      <ul className="mt-3 space-y-2">
        {rows === null
          ? Array.from({ length: RECENT_LIMIT }, (_, n) => <RowSkeleton key={n} />)
          : rows.map((tx) => <TransactionRow key={tx.id} tx={tx} />)}
      </ul>
    </div>
  );
}

function TransactionRow({ tx }: { tx: ActivityItem }) {
  const incoming = tx.direction === 'in';

  return (
    <li className="card-row flex items-center gap-3 rounded-[18px] bg-paper px-3.5 py-2.5">
      <Avatar id={tx.avatarId} name={tx.party} kind={tx.kind} size={44} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium tracking-[-0.01em]">{tx.party}</div>
        {/*
          * The status word carries the tooltip now that the glyph beside it is
          * gone. It was the only thing holding the timestamp and the reason for
          * the movement, and neither has anywhere else on the card to live.
          */}
        <div
          title={`${relativeDay(tx.at)}. ${tx.detail}${tx.real ? '' : ' (opening history)'}`}
          className="mt-0.5 w-fit truncate text-[11.5px] text-ink-faint"
        >
          {incoming ? 'Received' : 'Paid'}
        </div>
      </div>

      <span
        className={cn(
          'tabular shrink-0 text-[14px] font-semibold tracking-[-0.01em]',
          incoming ? 'text-gain' : 'text-loss',
        )}
      >
        {formatNaira(tx.amount, { signed: true })}
      </span>
    </li>
  );
}

/**
 * What a row looks like before the feed answers.
 *
 * Drawn at the real row's dimensions rather than as a shorter bar, so the
 * column does not jump when the data lands. The list is the tallest thing on
 * the overview and a reflow there moves the whole card.
 */
function RowSkeleton() {
  return (
    <li className="card-row flex items-center gap-3 rounded-[18px] bg-paper px-3.5 py-2.5">
      <span className="h-11 w-11 shrink-0 rounded-full bg-paper-sunk" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <span className="block h-3 w-1/2 rounded bg-paper-sunk" />
        <span className="block h-2.5 w-1/4 rounded bg-paper-sunk" />
      </div>
      <span className="h-3.5 w-20 shrink-0 rounded bg-paper-sunk" />
    </li>
  );
}
