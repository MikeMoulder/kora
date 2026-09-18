'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  Copy,
  Search,
  Star,
} from 'lucide-react';
import Image from 'next/image';
import { cn, copyText } from '@/lib/utils';
import { Avatar, EmptyRows, RowSkeleton, TransactionRow } from './parts';
import { Flag } from '../Flag';
import { Spinner } from '../ui/primitives';
import {
  ACCOUNT,
  BENEFICIARIES,
  formatNaira,
  relativeDay,
  type Beneficiary,
} from '@/lib/demo-data';
import type { ActivityItem, ActivityPayload } from '@/lib/account/activity';
import type { SimulatedPayout } from '@/lib/pollar/offramp';

// ── Rates ─────────────────────────────────────────────────────────────────

export interface PayoutRate {
  code: string;
  /** The currency's name, not the country's. */
  name: string;
  symbol: string;
  country: string;
  countryName: string;
  perNaira: number;
}

export interface RatesPayload {
  base: string;
  basePerUsd: number;
  asOf: string;
  source: string;
  stale: boolean;
  payouts: PayoutRate[];
}

export function useRates() {
  const [rates, setRates] = useState<RatesPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/rates')
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled && body?.ok) setRates(body.data as RatesPayload);
      })
      .catch(() => {
        // The strip and the quote both render an em dash without a rate.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return rates;
}

// ── Balance ───────────────────────────────────────────────────────────────

export interface BalancePayload {
  /** Sample data. Labelled as such wherever it is shown. */
  opening: number;
  /** Everything real that has happened since. */
  movements: number;
  balance: number;
  currency: string;
  movements24h: number;
  /** Null when the balance a day ago was nothing to measure against. */
  change24hPercent: number | null;
}

/**
 * The live balance.
 *
 * Returns a `refresh` because a deposit changes the number while the page is
 * open, and a balance that only updates on reload would have the account
 * holder wondering whether their money arrived.
 */
export function useBalance() {
  const [balance, setBalance] = useState<BalancePayload | null>(null);

  const refresh = useCallback(async () => {
    try {
      const body = await fetch('/api/account/balance', { cache: 'no-store' }).then((r) => r.json());
      if (body?.ok) setBalance(body.data as BalancePayload);
    } catch {
      // The card falls back to the opening figure, which is still true.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, refresh };
}

// ── Activity ─────────────────────────────────────────────────────

/**
 * The transaction rows and the spend series.
 *
 * Fetched rather than imported, because both are built from the ledger and
 * only the server can see it. `refresh` is what makes a send visible: the
 * money leaves, the balance moves, and the row has to appear next to it
 * rather than on the next reload.
 */
export function useActivity() {
  const [activity, setActivity] = useState<ActivityPayload | null>(null);

  const refresh = useCallback(async () => {
    try {
      const body = await fetch('/api/account/activity', { cache: 'no-store' }).then((r) =>
        r.json(),
      );
      if (body?.ok) setActivity(body.data as ActivityPayload);
    } catch {
      // The list and the chart both render their loading state instead.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { activity, refresh };
}

/**
 * What one panel hands to the send panel.
 *
 * Kora Agent and the beneficiary book both end in the same place: the send
 * form, filled in. They used to navigate to a separate page carrying a
 * sentence in the URL, which meant a second screen that had to re-derive
 * everything the dashboard already knew, including the balance it was
 * spending from.
 *
 * Filling a form the person then reads is different from prefilling one they
 * never asked for. Both of these follow an explicit action: picking a
 * beneficiary, or asking the agent to read a sentence.
 */
export interface SendDraft {
  name: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  account?: string;
  amount?: number;
  note?: string;
  /**
   * When the agent read a date out of the sentence. ISO 8601.
   *
   * Absent means now, which is also what the parser means by `timing: 'now'`.
   * A draft carrying this opens the send form already set to schedule, with
   * the date filled, because "pay Carlos on Friday" has said everything and
   * making somebody re-enter the Friday is the opposite of the point.
   */
  dueAt?: string;
  /**
   * Where this draft came from, carried onto the payment's record.
   *
   * Only the agent sets it. The beneficiary book is not a third origin: it
   * fills the form in and a person still reads it and presses send, so the
   * form is what made the request.
   *
   * It used to be inferred from whether the draft carried a due date, on the
   * grounds that only the agent produced one. That was true and still wrong:
   * "pay Carlos 40,000 naira" parsed by the agent has no date, so every
   * immediate send the agent composed was recorded as having come from the
   * form. An inference that is right about the common case and silently wrong
   * about the rest is worse than a field.
   */
  origin?: 'agent';
}

// ── Send ──────────────────────────────────────────────────────────────────

/**
 * Where the money actually leaves.
 *
 * Three steps in one panel: who and how much, then what it costs, then what
 * happened. No page change, because the balance it is spending from is on the
 * same screen and watching it move is the point.
 *
 * Nothing is prefilled. A send screen that arrives with a recipient already in
 * it is asking someone to check a name rather than type one, and checking is
 * the thing people skip. Saved recipients are one tap away and never assumed.
 */

interface Destination {
  country: string;
  countryName: string;
  currency: string;
  symbol: string;
}

/** The destinations Pollar settles, from the same feed the quote uses. */
function destinationsFrom(rates: RatesPayload | null): Destination[] {
  return (rates?.payouts ?? []).map((payout) => ({
    country: payout.country,
    countryName: payout.countryName,
    currency: payout.code,
    symbol: payout.symbol,
  }));
}

/**
 * A scheduled payment, narrowed to what the dashboard reads.
 *
 * Declared here rather than imported from `lib/schedule/types`, which is the
 * same choice every other payload in this file makes. That module is reached
 * through `lib/schedule/store`, which imports the Redis client, and a client
 * component that pulls a server module in for a type is a client component
 * that will one day pull it in for a value.
 */
export interface ScheduledPaymentShape {
  reference: string;
  createdAt: string;
  dueAt: string;
  recipient: {
    name: string;
    country: string;
    countryName: string;
    account: string | null;
    avatarId: string | null;
  };
  amount: number;
  currency: string;
  note: string | null;
  origin: 'agent' | 'form';
  status: 'held' | 'sent' | 'cancelled' | 'failed';
  outcome: {
    at: string;
    hash: string | null;
    explorer: string | null;
    delivered: { amount: number; asset: string } | null;
    message: string | null;
  } | null;
}

/**
 * An ISO instant, in the shape `datetime-local` will accept.
 *
 * That input is picky in a way worth writing down: it wants
 * `YYYY-MM-DDTHH:mm` with no timezone and no seconds, and it silently renders
 * blank rather than complaining when given anything else. A value that does
 * not appear is a much harder bug than one that is rejected.
 *
 * The arithmetic converts to local time rather than slicing the ISO string,
 * which would show a person in Lagos a UTC time and call it theirs.
 */
function toLocalInput(iso?: string | null): string {
  const base = iso ? new Date(iso) : defaultDueDate();
  if (Number.isNaN(base.getTime())) return toLocalInput(null);

  const offset = base.getTimezoneOffset() * 60_000;
  return new Date(base.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * What the picker starts on when nobody has said.
 *
 * Tomorrow at nine in the morning, local. A default of "now" would put the
 * input in a state the API refuses the moment a second passes, and a default
 * of "in an hour" reads as a stopwatch rather than a payment date.
 */
function defaultDueDate(): Date {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next;
}

/** The local input's value, back as an ISO instant the API will take. */
function fromLocalInput(value: string): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** "Fri 19 Sep, 09:00", which is what a person calls a date. */
export function formatDue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SentPayment {
  reference: string;
  recipient: { name: string; countryName: string; wallet: string };
  sent: { amount: number; currency: string };
  delivered: { amount: number; asset: string; hash: string; explorer: string };
  /** The last mile, priced but not executed. Always present, always simulated. */
  payout: SimulatedPayout;
}

export function SendPanel({
  rates,
  balance,
  draft,
  onSent,
}: {
  rates: RatesPayload | null;
  balance: BalancePayload | null;
  /** Filled in by Kora Agent or the beneficiary book. Empty otherwise. */
  draft?: SendDraft | null;
  onSent?: () => void;
}) {
  const destinations = useMemo(() => destinationsFrom(rates), [rates]);

  const [step, setStep] = useState<'form' | 'review' | 'done'>('form');
  const [picking, setPicking] = useState(false);

  const [name, setName] = useState(draft?.name ?? '');
  const [country, setCountry] = useState(draft?.country ?? '');
  const [account, setAccount] = useState(draft?.account ?? '');
  const [digits, setDigits] = useState(draft?.amount ? String(draft.amount) : '');
  const [note, setNote] = useState(draft?.note ?? '');

  /*
   * When it goes.
   *
   * `local` is what the input holds, in the browser's own timezone and in the
   * shape `datetime-local` insists on, which is `YYYY-MM-DDTHH:mm` with no
   * zone. The API takes ISO 8601 with a zone, so the conversion happens at the
   * point of sending rather than being carried in two states that can
   * disagree.
   */
  const [when, setWhen] = useState<'now' | 'later'>(draft?.dueAt ? 'later' : 'now');
  const [local, setLocal] = useState(() => toLocalInput(draft?.dueAt));

  const [quote, setQuote] = useState<KoraQuoteShape | null>(null);
  const [sent, setSent] = useState<SentPayment | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledPaymentShape | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Guards the auto-review against Strict Mode running the effect twice. */
  const autoReviewed = useRef(false);

  const amount = Number(digits || '0');
  const available = balance?.balance ?? 0;
  const destination = destinations.find((d) => d.country === country) ?? null;

  /*
   * A testing shortcut, and labelled as one.
   *
   * The amount is deliberately small. Every run spends real USDC out of
   * KORA's float, the float is topped up twenty at a time on a two hour
   * cooldown, and a mock button that quietly drains it is a trap rather than
   * a convenience.
   */
  const fillMock = useCallback(() => {
    setName('Carlos Mamani');
    setCountry('BO');
    setAccount('Banco Union ****4471');
    setDigits('2000');
    setNote('logo and brand system');
  }, []);

  /**
   * Whether the picked time is one the API will take.
   *
   * Checked here as well as on the server, and the two are doing different
   * jobs. The server's check is the one that matters and cannot be skipped;
   * this one exists so the button is dead rather than the request failing,
   * because a form that lets you press Review and then tells you the date was
   * yesterday has wasted a round trip to say something it already knew.
   */
  const dueAt = when === 'later' ? fromLocalInput(local) : null;
  const dueIsFuture = dueAt !== null && Date.parse(dueAt) > Date.now();

  const ready =
    name.trim().length > 1 &&
    country !== '' &&
    amount >= 1000 &&
    (when === 'now' || dueIsFuture);

  const review = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      const body = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ corridorId: 'NG.NGN.NIP.onramp', amount }),
      }).then((r) => r.json());

      if (!body.ok) throw new Error(body.error ?? 'Could not price that.');

      const priced = (body.data.quote ?? body.data) as KoraQuoteShape;
      setQuote(priced);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not price that.');
    } finally {
      setBusy(false);
    }
  }, [amount]);

  const send = useCallback(async () => {
    if (!destination) return;

    setBusy(true);
    setError(null);

    try {
      const body = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recipientName: name.trim(),
          country: destination.country,
          countryName: destination.countryName,
          payoutCurrency: destination.currency,
          account: account.trim() || undefined,
          amount,
          note: note.trim() || undefined,
          origin: draft?.origin === 'agent' ? 'agent' : 'form',
        }),
      }).then((r) => r.json());

      if (!body.ok) throw new Error(body.error ?? 'The payment did not go through.');

      setSent(body.data as SentPayment);
      setStep('done');
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The payment did not go through.');
    } finally {
      setBusy(false);
    }
  }, [account, amount, destination, draft?.origin, name, note, onSent]);

  /**
   * Book it for later instead of sending it.
   *
   * Deliberately a separate function from `send` rather than a branch inside
   * it. They hit different endpoints, they leave the panel in different
   * states, and the one thing they must not share is the possibility of
   * calling the wrong one: a flag threaded through a single function that
   * either moves money now or reserves it for Friday is a flag that will
   * eventually be wrong.
   */
  const bookIt = useCallback(async () => {
    if (!destination || !dueAt) return;

    setBusy(true);
    setError(null);

    try {
      const body = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recipientName: name.trim(),
          country: destination.country,
          countryName: destination.countryName,
          account: account.trim() || undefined,
          amount,
          note: note.trim() || undefined,
          dueAt,
          origin: draft?.origin === 'agent' ? 'agent' : 'form',
        }),
      }).then((r) => r.json());

      if (!body.ok) throw new Error(body.error ?? 'That could not be scheduled.');

      setScheduled(body.data.payment as ScheduledPaymentShape);
      setStep('done');
      /*
       * The same callback a send uses, because the same thing happened to the
       * balance. The naira is reserved at this point, so the card and the
       * activity list are both stale until this fires.
       */
      onSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be scheduled.');
    } finally {
      setBusy(false);
    }
  }, [account, amount, destination, draft?.origin, dueAt, name, note, onSent]);

  /*
   * A draft that already has everything goes straight to review.
   *
   * Kora Agent reading a sentence into a filled form and stopping there made
   * it a text box with extra steps: the person still had to find the button
   * and press it to learn what the payment would cost. A complete draft
   * arrives priced, one confirmation away, which is the only version where
   * saying it out loud beats typing it.
   *
   * Incomplete drafts still land on the form. The beneficiary book fills a
   * name and an account but never an amount, and guessing one would be worse
   * than asking.
   */
  useEffect(() => {
    if (autoReviewed.current) return;
    if (!draft?.name || !draft.country || !draft.amount || draft.amount < 1000) return;

    autoReviewed.current = true;
    review();
  }, [draft, review]);

  if (picking) {
    return (
      <BeneficiaryPicker
        onPick={(b) => {
          setName(b.name);
          setCountry(b.country);
          setAccount(b.account);
          setPicking(false);
        }}
        onCancel={() => setPicking(false)}
      />
    );
  }

  // ── Done, scheduled ─────────────────────────────────────────────────────
  /*
   * A separate finished state, not the receipt with the hash blanked out.
   *
   * The sent screen's whole argument is the Stellar transaction: three legs,
   * an explorer link, a figure that landed. None of that exists yet for a
   * payment due on Friday, and rendering the same layout with the proof
   * missing would read as a send that half worked. What did happen is that
   * money was reserved, so that is what this says.
   */
  if (step === 'done' && scheduled) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper">
            <CalendarClock className="h-4 w-4" strokeWidth={2} />
          </span>
          <div>
            <div className="text-sm font-semibold">Scheduled</div>
            <div className="text-[11px] text-ink-faint">{scheduled.reference}</div>
          </div>
        </div>

        <dl className="mt-5 space-y-2 text-xs">
          <Line label="Amount">{formatNaira(scheduled.amount)}</Line>
          <Line label="To">{scheduled.recipient.name}</Line>
          <Line label="In">{scheduled.recipient.countryName}</Line>
          <Line label="Sends">
            <span className="font-semibold text-ink">{formatDue(scheduled.dueAt)}</span>
          </Line>
        </dl>

        <div className="leg-ours mt-5 rounded-xl px-3.5 py-3 text-[11px] leading-relaxed">
          <div className="font-medium">The naira has already left the balance</div>
          <div className="mt-1">
            It is held against this payment rather than promised, so the figure on your
            balance card is money you can still spend. Cancel before it is due and it comes
            straight back.
          </div>
        </div>

        <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">
          Nothing has touched Stellar yet. When it falls due, KORA delivers USDC from its
          float to a Pollar wallet for {scheduled.recipient.name}, and the hash appears
          under Scheduled.
        </p>

        <button
          type="button"
          onClick={() => {
            setStep('form');
            setScheduled(null);
            setName('');
            setCountry('');
            setAccount('');
            setDigits('');
            setNote('');
            setWhen('now');
            setLocal(toLocalInput(null));
          }}
          className="mt-4 text-[11px] text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Schedule another
        </button>
      </div>
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────
  if (step === 'done' && sent) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gain text-paper">
            <Check className="h-4 w-4" strokeWidth={2.4} />
          </span>
          <div>
            <div className="text-sm font-semibold">Sent</div>
            <div className="text-[11px] text-ink-faint">{sent.reference}</div>
          </div>
        </div>

        <dl className="mt-5 space-y-2 text-xs">
          <Line label="You sent">{formatNaira(sent.sent.amount)}</Line>
          <Line label="Delivered">
            <span className="font-semibold text-ink">
              {sent.delivered.amount.toFixed(7)} {sent.delivered.asset}
            </span>
          </Line>
          <Line label="To">{sent.recipient.name}</Line>
        </dl>

        {/*
          * The route, as three legs with three different owners.
          *
          * This is the one screen where the ownership language has to do real
          * work, because a judge reading it has to be able to tell which part
          * of the corridor we built, which part Pollar owns, and which part
          * has not run. Fill and weight carry it: solid is ours, hairline is
          * Pollar's, dashed has not happened.
          */}
        <div className="mt-5 space-y-2">
          <Leg
            owner="ours"
            label={`Naira debited · ${ACCOUNT.receiving.rail}`}
            value={formatNaira(sent.sent.amount)}
            note="KORA's rail, in Nigeria. Real money off a real ledger."
          />

          <Leg
            owner="theirs"
            label={`${sent.delivered.asset} delivered · Pollar wallet`}
            value={`${sent.delivered.amount.toFixed(7)} ${sent.delivered.asset}`}
            note={`Non-custodial, provisioned by Pollar for ${sent.recipient.name}, who never signed up for anything.`}
          >
            <div className="mt-1.5 break-all font-mono text-[9.5px] text-ink-soft">
              {sent.recipient.wallet}
            </div>
          </Leg>

          <Leg
            owner="simulated"
            label={`Bolivianos · ${sent.payout.anchor.provider} ${sent.payout.anchor.rail}`}
            value={`≈ ${sent.payout.payout.amount.toLocaleString()} ${sent.payout.payout.currency}`}
            note="Not executed. This is the beneficiary's own off-ramp to run."
          >
            <PayoutBlockers payout={sent.payout} />
          </Leg>
        </div>

        <a
          href={sent.delivered.explorer}
          target="_blank"
          rel="noreferrer"
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper transition-colors hover:bg-ink-soft"
        >
          View on Stellar
          <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
        </a>

        <button
          type="button"
          onClick={() => {
            setStep('form');
            setSent(null);
            setName('');
            setCountry('');
            setAccount('');
            setDigits('');
            setNote('');
          }}
          className="mt-3 text-[11px] text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Send another
        </button>
      </div>
    );
  }

  // ── Review ──────────────────────────────────────────────────────────────
  if (step === 'review' && quote && destination) {
    const receives = rates?.payouts.find((p) => p.code === destination.currency);

    return (
      <div className="flex h-full flex-col">
        <button
          type="button"
          onClick={() => setStep('form')}
          className="self-start text-[11px] text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          &larr; Back
        </button>

        <div className="mt-4 text-center">
          <div className="tabular text-[30px] font-bold leading-none tracking-[-0.03em]">
            {formatNaira(amount)}
          </div>
          <div className="mt-1.5 text-xs text-ink-faint">
            to {name} in {destination.countryName}
          </div>
        </div>

        {/*
          * The engine's own breakdown, rendered rather than recomputed.
          * Deriving the split here from the total produced a fee that was
          * fifty kobo out, which is exactly the class of error a payments
          * screen must not introduce: two numbers for one fee, and the
          * prettier one on screen.
          */}
        <dl className="mt-6 space-y-2 border-t border-rule pt-4 text-xs">
          {quote.breakdown
            .filter((row) => row.label !== 'You send')
            .map((row) => (
              <Line key={row.label} label={row.label}>
                {formatNaira(row.amount, { signed: row.amount < 0 })}
              </Line>
            ))}
          <Line label="Delivered as">
            <span className="font-semibold text-ink">
              {quote.receiveUsdc.toFixed(4)} USDC
            </span>
          </Line>
          <Line label="They receive">
            {receives
              ? `${receives.symbol}${(amount * receives.perNaira).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : '—'}
          </Line>
          <Line label="Balance after">{formatNaira(available - amount)}</Line>
        </dl>

        {error && (
          <p className="mt-4 rounded-lg border border-ink px-3 py-2.5 text-[11px] leading-relaxed">
            {error}
          </p>
        )}

        {when === 'later' && dueAt && (
          <div className="leg-ours mt-5 rounded-xl px-3.5 py-3 text-[11px] leading-relaxed">
            <div className="font-medium">Scheduled for {formatDue(dueAt)}</div>
            <div className="mt-0.5">
              The rate above prices it today. It will be sent at the rate on the day, which
              is the only figure that can be true for a payment that has not happened yet.
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={when === 'later' ? bookIt : send}
          disabled={busy}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper press hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
        >
          {busy && <Spinner />}
          {busy
            ? when === 'later'
              ? 'Scheduling'
              : 'Sending'
            : when === 'later'
              ? `Schedule ${formatNaira(amount)}`
              : `Send ${formatNaira(amount)}`}
        </button>

        <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
          {when === 'later'
            ? `Your naira is debited now and held, so the balance you see is money you can still use. It is delivered to ${name} when it falls due, and comes back if the delivery fails.`
            : `Your naira is debited, then KORA delivers USDC from its float to a Pollar wallet for ${name}. If the delivery fails the naira comes straight back.`}
        </p>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-paper">
          <Flag code={ACCOUNT.country} size={13} />
          {ACCOUNT.currency} balance
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fillMock}
            title="Fill the form with test details"
            className="press rounded-md border border-dashed border-ink-ghost px-2 py-1 text-[10px] font-medium text-ink-faint hover:border-ink hover:text-ink"
          >
            Fill mock
          </button>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="press text-xs text-ink-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Saved
          </button>
        </div>
      </div>

      <div className="tabular mt-2 text-[11px] text-ink-faint">
        {formatNaira(available)} available
      </div>

      <div className="mt-5 space-y-3">
        <Field label="Recipient">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className="h-10 w-full rounded-lg border border-rule bg-paper-sunk px-3 text-sm outline-none transition-[color,background-color,border-color] duration-[130ms] placeholder:text-ink-faint focus:border-ink focus:bg-paper"
          />
        </Field>

        <Field label="Destination">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-10 w-full rounded-lg border border-rule bg-paper-sunk px-3 text-sm outline-none transition-[color,background-color,border-color] duration-[130ms] focus:border-ink focus:bg-paper"
          >
            <option value="">Choose a country</option>
            {destinations.map((d) => (
              <option key={d.country} value={d.country}>
                {d.countryName} · {d.currency}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Their account">
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="Bank and account number"
            className="h-10 w-full rounded-lg border border-rule bg-paper-sunk px-3 text-sm outline-none transition-[color,background-color,border-color] duration-[130ms] placeholder:text-ink-faint focus:border-ink focus:bg-paper"
          />
        </Field>

        <Field label="Amount">
          <div className="flex h-10 items-center gap-1.5 rounded-lg border border-rule bg-paper-sunk px-3 focus-within:border-ink focus-within:bg-paper">
            <span className="text-sm font-semibold">&#8358;</span>
            <input
              value={digits ? amount.toLocaleString() : ''}
              onChange={(e) => setDigits(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))}
              inputMode="numeric"
              placeholder="0"
              aria-label="Amount in naira"
              className="tabular w-full bg-transparent text-sm font-medium outline-none placeholder:text-ink-faint"
            />
          </div>
        </Field>

        <Field label="Note">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What it is for"
            maxLength={60}
            className="h-10 w-full rounded-lg border border-rule bg-paper-sunk px-3 text-sm outline-none transition-[color,background-color,border-color] duration-[130ms] placeholder:text-ink-faint focus:border-ink focus:bg-paper"
          />
        </Field>

        {/*
          * Not a `Field`.
          *
          * `Field` wraps its children in a `<label>`, which is right for a
          * single input and wrong for this. A label may only name one control,
          * so a label containing a radiogroup and a datetime input names the
          * first thing it finds and silently mislabels the rest. The heading
          * is a plain span here and each control carries its own name.
          */}
        <div className="block">
          <span className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">When</span>
          <div className="mt-1.5">
          {/*
            * Two buttons rather than a checkbox or a select.
            *
            * The choice changes what the next screen does with your money, so
            * both options have to be readable at a glance without opening
            * anything. A collapsed select showing "Now" hides the fact that
            * scheduling exists, and this is the only place in the app where
            * anybody would find out that it does.
            */}
          <div
            role="radiogroup"
            aria-label="When to send"
            className="grid grid-cols-2 gap-2"
          >
            <TimingChoice
              label="Now"
              active={when === 'now'}
              onClick={() => setWhen('now')}
            />
            <TimingChoice
              label="Schedule"
              active={when === 'later'}
              onClick={() => setWhen('later')}
            />
          </div>

          {when === 'later' && (
            <div className="mt-2">
              <input
                type="datetime-local"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                /*
                 * `min` stops the obvious mistake in the picker itself rather
                 * than after a round trip. It is not a guard: a browser will
                 * happily hand back a value outside it and the API refuses
                 * anything already past regardless.
                 */
                min={toLocalInput(new Date().toISOString())}
                aria-label="Date and time to send"
                className="h-10 w-full rounded-lg border border-rule bg-paper-sunk px-3 text-sm outline-none transition-[color,background-color,border-color] duration-[130ms] focus:border-ink focus:bg-paper"
              />
              <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
                {dueIsFuture
                  ? `The naira leaves your balance now and is held until ${formatDue(dueAt as string)}.`
                  : 'Pick a time in the future.'}
              </p>
            </div>
          )}
          </div>
        </div>
      </div>

      {amount > available && (
        <p className="mt-3 text-[11px] text-loss">
          That is more than the {formatNaira(available)} available.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-ink px-3 py-2.5 text-[11px] leading-relaxed">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={review}
        disabled={!ready || busy || amount > available}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper press hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
      >
        {busy && <Spinner />}
        {busy ? 'Pricing' : 'Review payment'}
        {!busy && <ArrowRight className="h-4 w-4" strokeWidth={2} />}
      </button>

      <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
        Minimum &#8358;1,000. Review prices it against the live rate through the real
        corridor engine. Nothing moves until you confirm.
      </p>
    </div>
  );
}

/**
 * One half of the now-or-later choice.
 *
 * A button carrying `role="radio"` rather than a real radio input. The two
 * behave the same for a screen reader, which is what `aria-checked` is for,
 * and only one of them can be made to look like the rest of this interface
 * without fighting a user agent stylesheet that differs on every platform.
 *
 * The selected state is a fill, not a tick or an outline. That is the same
 * rule the corridor legs use, and it is the one that survives a bad projector.
 */
function TimingChoice({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'press h-10 rounded-lg border text-sm font-medium transition-[color,background-color,border-color] duration-[130ms]',
        active
          ? 'border-ink bg-ink text-paper'
          : 'border-rule bg-paper-sunk text-ink-muted hover:border-ink hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}

/** What the corridor engine returns, narrowed to what this panel reads. */
interface KoraQuoteShape {
  fee: number;
  rate: number;
  rateSource: string;
  receiveUsdc: number;
  /** The engine's own arithmetic. Rendered, never recomputed. */
  breakdown: { label: string; amount: number; currency: string; note?: string }[];
}

/**
 * One leg of the route.
 *
 * The three `leg-*` classes in globals.css carry ownership, and this is the
 * component that applies them so no screen restates the rule. Solid fill is
 * the leg KORA built, a hairline outline is the leg Pollar owns, a dashed
 * outline has not run. Take the colour away and the three are still distinct,
 * which is the whole reason the language is fill and weight rather than hue.
 */
function Leg({
  owner,
  label,
  value,
  note,
  children,
}: {
  owner: 'ours' | 'theirs' | 'simulated';
  label: string;
  value: string;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl p-3',
        owner === 'ours' && 'leg-ours',
        owner === 'theirs' && 'leg-theirs',
        owner === 'simulated' && 'leg-simulated',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.1em] opacity-70">{label}</span>
        <span className="tabular shrink-0 text-[12px] font-semibold">{value}</span>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed opacity-70">{note}</p>
      {children}
    </div>
  );
}

/**
 * Why the boliviano leg stops, with the evidence.
 *
 * The probe is the part that matters. Anyone can write "this would need the
 * user's session" in a comment; this shows the status and the code Pollar
 * actually answered with, on this run, a moment ago. A refusal you can read
 * is worth more than a claim you have to take on trust.
 */
function PayoutBlockers({ payout }: { payout: SimulatedPayout }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="press text-[10px] font-medium uppercase tracking-[0.1em] underline-offset-4 hover:underline"
      >
        {open ? 'Hide why' : 'Why not'}
      </button>

      {open && (
        <div className="rise mt-2 space-y-2">
          {payout.blocked.reasons.map((reason) => (
            <p key={reason} className="text-[10px] leading-relaxed opacity-80">
              {reason}
            </p>
          ))}

          {payout.blocked.probe && (
            <div className="rounded-lg border border-dashed border-ink-ghost p-2">
              <div className="text-[9px] uppercase tracking-[0.1em] opacity-60">
                Asked, just now
              </div>
              <div className="mt-1 break-all font-mono text-[9.5px]">
                GET {payout.blocked.probe.endpoint}
              </div>
              <div className="mt-1 font-mono text-[9.5px] font-semibold">
                {payout.blocked.probe.status} {payout.blocked.probe.code}
              </div>
            </div>
          )}

          <div className="text-[9px] leading-relaxed opacity-60">
            Rate {payout.rate.perUsd} {payout.payout.currency}/USD, {payout.rate.source}.
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular text-right text-ink">{children}</dd>
    </div>
  );
}

// ── Kora Agent ────────────────────────────────────────────────────────────

const AGENT_EXAMPLES = [
  'Send ₦2,000 to Carlos Mamani in Bolivia for the brand system',
  'Pay Maria Quispe ₦3,500 in Bolivia for milestone three',
  'Send ₦5,000 to Diego Rojas in Bolivia for the launch film',
];

interface ParsedIntent {
  intent: {
    recipientName: string | null;
    destinationCountry: string | null;
    amount: number | null;
    currency: string | null;
    purpose: string | null;
    timing: 'now' | 'scheduled';
    scheduledFor: string | null;
  };
  source: 'gemini' | 'rules';
  note: string | null;
  resolution: {
    status: string;
    message: string;
    selected: { countryName: string; railLabel: string; readiness: string; country: string } | null;
    /** Where the money lands. Null until the sentence names a country. */
    destination: {
      country: string;
      countryName: string | null;
      settledBy: 'pollar' | 'unsupported';
    } | null;
  };
}

/**
 * Kora Agent.
 *
 * The same parser the corridor flow uses, surfaced as a panel beside the
 * account. It reads a sentence into a structured intent and stops there. It
 * cannot pick a corridor, produce a quote or move money, and the button it
 * offers leads to the ordinary review screen rather than to a payment.
 *
 * That boundary is the point. An agent that could spend from this balance on
 * the strength of its own parse would be a worse product, not a better one.
 */
export function AgentPanel({ onCompose }: { onCompose?: (draft: SendDraft) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedIntent | null>(null);
  const [lastText, setLastText] = useState('');

  const run = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setBusy(true);
    setError(null);
    setParsed(null);
    setLastText(trimmed);

    try {
      const res = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error ?? 'Could not read that.');
      setParsed(body.data as ParsedIntent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that.');
    } finally {
      setBusy(false);
    }
  }, []);

  const ready = parsed?.resolution.status === 'ready';

  return (
    <div className="flex h-full flex-col">
      <AgentIdentity />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(text);
        }}
        className="mt-5"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              run(text);
            }
          }}
          rows={3}
          maxLength={300}
          placeholder="Send &#8358;250,000 to Carlos in Bolivia for the brand system"
          aria-label="Tell Kora Agent what to do"
          className="w-full resize-none rounded-xl border border-rule bg-paper-sunk px-3.5 py-3 text-sm leading-relaxed outline-none transition-[color,background-color,border-color] duration-[130ms] placeholder:text-ink-faint focus:border-ink focus:bg-paper"
        />

        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper press hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
        >
          {busy && <Spinner />}
          {busy ? 'Reading' : 'Read this'}
        </button>
      </form>

      {!parsed && !busy && !error && (
        <div className="mt-5 space-y-1.5">
          <SectionLabel>Try</SectionLabel>
          {AGENT_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setText(example);
                run(example);
              }}
              className="block w-full rounded-lg border border-rule px-3 py-2 text-left text-xs leading-relaxed text-ink-muted transition-colors hover:border-ink hover:text-ink"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-ink px-3 py-2.5 text-xs">{error}</p>
      )}

      {parsed && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between">
            <SectionLabel>Understood as</SectionLabel>
            {/*
              * Which parser read the sentence, not which ones ran.
              *
              * This said "Gemini and rules" because both did run and the
              * result was a merge of the two. It is no longer a merge of
              * equals: the model decides and the rules fill what it left
              * blank, so naming both implied a collaboration that was not
              * happening. "Rule parser" now means the model could not be
              * reached, which is worth being able to see on the screen.
              */}
            <span className="rounded-md border border-rule px-1.5 py-0.5 text-[10px] text-ink-muted">
              {parsed.source === 'gemini' ? 'Gemini' : 'Rule parser'}
            </span>
          </div>

          <dl className="mt-2.5 divide-y divide-rule rounded-xl border border-rule">
            <Slot label="Recipient" value={parsed.intent.recipientName} />
            {/*
              * The name, not the code.
              *
              * This row printed "BO" because that is what the parser produces
              * and the panel was rendering the field straight through. An ISO
              * code is the correct thing to carry between the model and the
              * corridor engine and the wrong thing to show the person paying,
              * who did not type a code and has no reason to read one. The
              * resolver now returns the name beside it; the code is still what
              * everything downstream uses.
              */}
            <Slot
              label="Destination"
              value={
                parsed.resolution.destination?.countryName ??
                parsed.intent.destinationCountry
              }
            />
            <Slot
              label="Amount"
              value={
                parsed.intent.amount !== null
                  ? `${parsed.intent.amount.toLocaleString()} ${parsed.intent.currency ?? ''}`
                  : null
              }
            />
            <Slot label="Purpose" value={parsed.intent.purpose} />
            <Slot
              label="Timing"
              value={
                /*
                 * The date only, not the time, unlike everywhere else.
                 *
                 * The parser is given a sentence that says "tomorrow" and has
                 * to invent an hour to go with it. Rendering that invented
                 * hour here would present a guess as a decision. The send form
                 * shows the exact minute, because by then it is a field
                 * somebody can see and change.
                 */
                parsed.intent.timing === 'scheduled' && parsed.intent.scheduledFor
                  ? new Date(parsed.intent.scheduledFor).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })
                  : 'Now'
              }
            />
          </dl>

          {/*
            * What the parser wants to admit to.
            *
            * The field has been on the payload since the first version and
            * nothing rendered it, which made the promise of "no silent
            * degradation" one the interface could not keep: a sentence read by
            * the rule parser because Gemini was unreachable looked exactly
            * like one Gemini read. This is where that says so, along with any
            * assumption the model made about a date or a currency.
            */}
          {parsed.note && (
            <p className="mt-2 px-1 text-[10px] leading-relaxed text-ink-faint">{parsed.note}</p>
          )}

          <div
            className={cn(
              'mt-3 rounded-xl px-3.5 py-3 text-xs leading-relaxed',
              // The funding corridor belongs to KORA, so a resolved one is
              // drawn solid. Outlining it here would have said Pollar owns it.
              ready ? 'leg-ours' : 'leg-simulated',
            )}
          >
            {parsed.resolution.selected && (
              <div className="mb-1.5 flex items-center gap-2 font-medium">
                <Flag code={parsed.resolution.selected.country} size={13} />
                {parsed.resolution.selected.countryName}, {parsed.resolution.selected.railLabel}
              </div>
            )}
            {parsed.resolution.message}
          </div>

          <button
            type="button"
            onClick={() => {
              /*
               * `intent.destinationCountry` and not `resolution.selected`.
               * The resolver picks the corridor the money is funded from,
               * which is Nigeria, so reading the country off it sent every
               * payment to the country it came from and left the destination
               * blank. The parser already returns the destination as an ISO
               * code; it just was not the field being read.
               */
              const destination = parsed.intent.destinationCountry;
              if (!destination) return;

              onCompose?.({
                name: parsed.intent.recipientName ?? '',
                country: destination,
                origin: 'agent',
                /*
                 * The parsed date, carried through at last.
                 *
                 * `timing` and `scheduledFor` have come out of the parser
                 * since the first version and nothing ever read them, so
                 * "pay Carlos on Friday" produced a form that would have sent
                 * it immediately. Only forwarded when the parser said
                 * `scheduled` and produced a date that is still ahead: a model
                 * reading "Friday" on a Saturday can return a Friday that has
                 * gone, and the send form would then open on a schedule it
                 * cannot book.
                 */
                dueAt:
                  parsed.intent.timing === 'scheduled' &&
                  parsed.intent.scheduledFor &&
                  Date.parse(parsed.intent.scheduledFor) > Date.now()
                    ? parsed.intent.scheduledFor
                    : undefined,
                // Only an amount the account can actually spend. KORA funds
                // from one region and that region is Nigeria, so a figure
                // the parser read as shillings is not a naira figure and
                // passing it through would quote the wrong payment.
                amount:
                  parsed.intent.currency && parsed.intent.currency !== 'NGN'
                    ? undefined
                    : (parsed.intent.amount ?? undefined),
                note: parsed.intent.purpose ?? undefined,
              });
            }}
            disabled={!ready}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper press hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
          >
            Review this payment
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>

          <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
            That is the whole of what the agent did. Review opens the send form with those
            fields already in it, and nothing leaves the balance until you confirm a quote
            on the next screen.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Who the agent is, at the top of its own panel.
 *
 * The name is deliberately absent. `PanelFrame` already prints "Kora Agent"
 * an inch above this, and the old header repeated it, so the first two things
 * anybody read on opening the panel were the same two words. The portrait
 * carries the identity instead and the line beside it does the work the name
 * was not doing.
 *
 * The portrait replaces a lucide sparkle in a black square. Two reasons, and
 * the second is the real one. A sparkle is the house glyph for "there is a
 * model behind this" across the entire category, so it identifies the feature
 * without identifying this feature. And the app already draws every
 * counterparty as a portrait: putting the agent in the same slot says it is
 * another party to the transaction, which is exactly the claim the panel then
 * spends the rest of its height qualifying.
 *
 * Not `Avatar`. That component is for counterparties, keyed by a file stem in
 * `public/avatars` with a monogram behind it for the ones who have no picture.
 * The agent is not in that book, has exactly one portrait, and would fall back
 * to the initials "KA" in a filled disc if the file were missing, which reads
 * as a person nobody can name. A plain square tile with the artwork's own
 * background showing through is the honest object.
 */
function AgentIdentity() {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/kora-agent.png"
        alt=""
        aria-hidden
        width={44}
        height={44}
        quality={82}
        /*
         * Eager for the same reason the counterparty portraits are: the panel
         * is not in the DOM until somebody opens it, so nothing is being
         * deferred except this one image at the top of what they just asked
         * for.
         */
        loading="eager"
        className="h-11 w-11 shrink-0 rounded-xl object-cover"
      />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold tracking-[-0.01em]">
          Say it, do not fill it in
        </div>
        <div className="mt-0.5 text-[11px] leading-snug text-ink-muted">
          Reads one sentence into a payment. Cannot send one.
        </div>
      </div>
    </div>
  );
}

/**
 * The panel's section heading.
 *
 * Three places were spelling the same ten utility classes by hand and one of
 * them had already drifted, which is the usual way a set of headings stops
 * lining up.
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">{children}</div>
  );
}

function Slot({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-[0.06em] text-ink-faint">{label}</dt>
      <dd className={cn('text-right text-xs', value ? 'text-ink' : 'text-ink-ghost')}>
        {value ?? 'not stated'}
      </dd>
    </div>
  );
}

// ── Beneficiaries ─────────────────────────────────────────────────────────

export function BeneficiaryPanel({ onCompose }: { onCompose?: (draft: SendDraft) => void }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? BENEFICIARIES.filter(
          (b) =>
            b.name.toLowerCase().includes(q) ||
            b.countryName.toLowerCase().includes(q) ||
            b.role.toLowerCase().includes(q),
        )
      : BENEFICIARIES;
    return [...list].sort((a, b) => Number(b.favourite) - Number(a.favourite));
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div>
        <div className="text-sm font-semibold">Beneficiaries</div>
        <div className="text-[11px] text-ink-faint">
          {BENEFICIARIES.length} saved across{' '}
          {new Set(BENEFICIARIES.map((b) => b.country)).size} countries
        </div>
      </div>

      <div className="relative mt-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
          strokeWidth={1.8}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, country or role"
          className="h-10 w-full rounded-lg border border-rule bg-paper-sunk pl-9 pr-3 text-sm outline-none transition-[color,background-color,border-color] duration-[130ms] placeholder:text-ink-faint focus:border-ink focus:bg-paper"
        />
      </div>

      <div className="-mx-1 mt-3 flex-1 space-y-1.5 overflow-y-auto px-1">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-ink-faint">
            Nobody matches &ldquo;{query}&rdquo;.
          </p>
        )}

        {filtered.map((b) => (
          <div
            key={b.id}
            className="card-row lift group rounded-[14px] bg-paper p-3"
          >
            <div className="flex items-center gap-3">
              <Avatar id={b.avatarId} name={b.name} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{b.name}</span>
                  {b.favourite && (
                    <Star className="h-3 w-3 shrink-0 fill-ink text-ink" strokeWidth={0} />
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                  <Flag code={b.country} size={11} />
                  <span className="truncate">
                    {b.role}, {b.countryName}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-rule pt-2.5">
              <span className="text-[10px] text-ink-faint">
                {b.paymentCount > 0
                  ? `${b.paymentCount} payment${b.paymentCount === 1 ? '' : 's'}, last ${
                      b.lastPaidAt ? relativeDay(b.lastPaidAt) : 'never'
                    }`
                  : 'Never paid'}
              </span>
              <button
                type="button"
                onClick={() =>
                  onCompose?.({ name: b.name, country: b.country, account: b.account })
                }
                className="rounded-md border border-rule px-2 py-1 text-[11px] font-medium transition-colors hover:border-ink hover:bg-ink hover:text-paper"
              >
                Pay
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BeneficiaryPicker({
  onPick,
  onCancel,
}: {
  onPick: (b: Beneficiary) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Choose a recipient</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          Cancel
        </button>
      </div>

      <div className="-mx-1 mt-4 flex-1 space-y-1.5 overflow-y-auto px-1">
        {BENEFICIARIES.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onPick(b)}
            className="card-row lift press flex w-full items-center gap-3 rounded-[14px] bg-paper p-3 text-left"
          >
            <Avatar id={b.avatarId} name={b.name} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{b.name}</div>
              <div className="truncate text-[11px] text-ink-faint">{b.account}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Receive ───────────────────────────────────────────────────────────────

/**
 * The account holder's own deposit account, as issued by Flutterwave.
 *
 * Three fields and a way to copy them, which is the whole of a Nigerian
 * inbound transfer: a payer opens their bank app, types a bank and a NUBAN,
 * and checks the name that comes back. Anything else here would be decoration.
 *
 * Deliberately no QR. Nigeria has no scannable standard behind NIP the way
 * Kenya has USSD behind M-Pesa, so a code here would picture a payment method
 * that does not exist. The M-Pesa corridor emits a real scannable because
 * there is a real thing to scan.
 */

interface ReceivingAccount {
  provider: 'flutterwave' | 'simulated';
  mode: 'test' | 'live' | 'simulated';
  accountNumber: string;
  bankName: string;
  accountName: string;
  rail: string;
  testIdentity: boolean;
  note: string | null;
}

/**
 * Everything the account has done, as far back as the feed carries.
 *
 * Where View all goes now that the operator console is retired. That link
 * pointed at a reconciliation queue, which was never a transaction history
 * and never the thing somebody clicking "view all" under a list of payments
 * was asking for.
 *
 * A panel rather than a page for the same reason the others are: the balance
 * it is a history of stays on screen beside it. Nothing is fetched here. The
 * rows arrived with the four on the card, because the server had already
 * computed them and a second request to save two kilobytes is a worse trade
 * than sending them.
 *
 * Everything the account has done, and nothing it has not. The invented
 * opening history behind the spend chart is not listed here.
 */
export function ActivityPanel({
  activity,
  onSelect,
}: {
  activity: ActivityPayload | null;
  /** Open one row's full detail. Optional, so the panel still renders alone. */
  onSelect?: (tx: ActivityItem) => void;
}) {
  const rows = activity?.transactions ?? null;

  const [inflow, outflow] = useMemo(() => {
    const items = rows ?? [];
    return [
      items.filter((t) => t.direction === 'in').reduce((sum, t) => sum + t.amount, 0),
      items.filter((t) => t.direction === 'out').reduce((sum, t) => sum + Math.abs(t.amount), 0),
    ];
  }, [rows]);

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 gap-2">
        <Slot label="In" value={rows ? formatNaira(inflow) : null} />
        <Slot label="Out" value={rows ? formatNaira(outflow) : null} />
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
        {rows?.length
          ? `The last ${rows.length} movement${rows.length === 1 ? '' : 's'} on the account. ` +
            'Open one for the reference, the route and, where there is one, the transaction on Stellar.'
          : 'Every movement on the account lands here, with its reference, its route and, where there is one, its transaction on Stellar.'}
      </p>

      {/*
        * Scrolls inside the panel rather than growing it. The panel is already
        * as tall as the dashboard beside it, and a list that pushes past that
        * takes the page scrollbar with it, which moves the balance out of view.
        */}
      <ul className="-mr-1 mt-4 max-h-[min(60vh,560px)] space-y-2 overflow-y-auto pr-1">
        {rows === null ? (
          Array.from({ length: 6 }, (_, n) => <RowSkeleton key={n} index={n} />)
        ) : rows.length === 0 ? (
          <EmptyRows>
            Nothing has moved yet. Money you send or receive shows up here.
          </EmptyRows>
        ) : (
          rows.map((tx, n) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              index={n}
              showDate
              onSelect={onSelect ? () => onSelect(tx) : undefined}
            />
          ))
        )}
      </ul>
    </div>
  );
}

export function ReceivePanel({ onCredited }: { onCredited?: () => void }) {
  const [account, setAccount] = useState<ReceivingAccount | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/account/receiving')
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.ok) setAccount(body.data as ReceivingAccount);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async (key: string, value: string) => {
    const ok = await copyText(value);

    // A browser that refuses the clipboard has to say so. Flashing a tick on a
    // copy that never happened sends someone to their bank app to paste an
    // account number they do not have.
    setRefused(!ok);
    setCopied(ok ? key : null);

    if (timer.current) clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setCopied(null), 1600);
  }, []);

  const full = account
    ? `${account.accountName}\n${account.bankName}\n${account.accountNumber}`
    : '';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper">
          <ArrowDownLeft className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div>
          <div className="text-sm font-semibold">Your naira account</div>
          <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <Flag code={ACCOUNT.country} size={11} />
            {account ? account.rail : 'Opening your account'}
          </div>
        </div>
      </div>

      {!account && !failed && (
        <div className="mt-5 space-y-2" aria-live="polite">
          <span className="sr-only">Opening your deposit account</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[58px] animate-pulse rounded-xl bg-paper-sunk" />
          ))}
        </div>
      )}

      {failed && (
        <p className="mt-5 rounded-lg border border-ink px-3 py-2.5 text-xs leading-relaxed">
          Could not reach your deposit account. Nothing is wrong with the account itself,
          so try again in a moment.
        </p>
      )}

      {account && (
        <>
          <dl className="mt-5 divide-y divide-rule rounded-xl border border-rule">
            <CopyRow
              label="Account number"
              value={account.accountNumber}
              mono
              copied={copied === 'number'}
              onCopy={() => copy('number', account.accountNumber)}
            />
            <CopyRow
              label="Bank"
              value={account.bankName}
              copied={copied === 'bank'}
              onCopy={() => copy('bank', account.bankName)}
            />
            <CopyRow
              label="Account name"
              value={account.accountName}
              copied={copied === 'name'}
              onCopy={() => copy('name', account.accountName)}
            />
          </dl>

          <button
            type="button"
            onClick={() => copy('all', full)}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper transition-colors hover:bg-ink-soft"
          >
            {copied === 'all' ? (
              <Check className="h-4 w-4" strokeWidth={2} />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={1.8} />
            )}
            {copied === 'all' ? 'Copied' : 'Copy all three'}
          </button>

          {refused && (
            <p className="mt-3 rounded-lg border border-ink px-3 py-2.5 text-[11px] leading-relaxed">
              This browser refused the clipboard. Select the number above and copy it by hand.
            </p>
          )}

          <Provenance account={account} />

          {account.provider === 'flutterwave' && (
            <Deposit mode={account.mode} onCredited={onCredited} />
          )}
        </>
      )}
    </div>
  );
}

// ── Deposit ───────────────────────────────────────────────────────────────

type DepositStage = 'idle' | 'opening' | 'waiting' | 'credited' | 'error';

interface OpenedDeposit {
  reference: string;
  accountNumber: string;
  bankName: string;
  transferAmount: string;
  selfSettling: boolean;
}

/**
 * Put money into the account.
 *
 * The permanent account above is the right thing to hand a payer and the
 * wrong thing to test with: nothing in the sandbox ever pays into a static
 * account, so it waits forever and no webhook fires. This opens a bank
 * transfer charge instead, which names an amount, and which Flutterwave's
 * test mode pays itself within seconds.
 *
 * So the balance moves because money actually arrived against a reference
 * Flutterwave confirms, not because a number was incremented. In production
 * the same button shows an account for a human to pay, and the webhook does
 * what the polling does here.
 */
function Deposit({ mode, onCredited }: { mode: string; onCredited?: () => void }) {
  const [digits, setDigits] = useState('50000');
  const [stage, setStage] = useState<DepositStage>('idle');
  const [opened, setOpened] = useState<OpenedDeposit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  /*
   * Reset on mount, not just set on unmount.
   *
   * Strict Mode runs effects mount, cleanup, mount in development. A cleanup
   * that only ever sets this true leaves it true for the life of the
   * component, and every guard below then bails silently: the deposit opens,
   * Flutterwave settles it, and the button sits on "Opening" forever.
   */
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const amount = Number(digits || '0');

  const start = useCallback(async () => {
    setStage('opening');
    setError(null);
    setOpened(null);

    try {
      const body = await fetch('/api/account/deposit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount }),
      }).then((r) => r.json());

      if (!body.ok) throw new Error(body.error ?? 'Could not open the deposit.');

      const deposit = body.data as OpenedDeposit;
      if (cancelled.current) return;

      setOpened(deposit);
      setStage('waiting');

      /*
       * Poll rather than wait on the webhook. Localhost has no public URL for
       * Flutterwave to reach, and a delivery it decides to retry in thirty
       * minutes is no good to somebody watching the screen. Both paths credit
       * the same ledger entry, keyed on the reference, so whichever arrives
       * first wins and the other is a no-op.
       */
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        if (cancelled.current) return;

        const status = await fetch(`/api/account/deposit/${deposit.reference}`, {
          cache: 'no-store',
        }).then((r) => r.json());

        if (status?.ok && status.data.status === 'successful') {
          if (cancelled.current) return;
          setStage('credited');
          onCredited?.();
          return;
        }
      }

      if (!cancelled.current) {
        setStage('error');
        setError('Flutterwave has not confirmed it yet. It may still land.');
      }
    } catch (err) {
      if (cancelled.current) return;
      setStage('error');
      setError(err instanceof Error ? err.message : 'Could not open the deposit.');
    }
  }, [amount, onCredited]);

  const busy = stage === 'opening' || stage === 'waiting';

  return (
    <div className="mt-5 border-t border-rule pt-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Add money</div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-rule bg-paper-sunk px-3 focus-within:border-ink focus-within:bg-paper">
          <span className="text-sm font-semibold">&#8358;</span>
          <input
            value={amount.toLocaleString()}
            onChange={(e) => setDigits(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))}
            inputMode="numeric"
            aria-label="Amount to deposit"
            disabled={busy}
            className="tabular w-full bg-transparent text-sm font-medium outline-none disabled:opacity-60"
          />
        </div>

        <button
          type="button"
          onClick={start}
          disabled={busy || amount < 100}
          className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-ink px-4 text-[13px] font-medium text-paper press hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
        >
          {busy && <Spinner />}
          {stage === 'opening' ? 'Opening' : stage === 'waiting' ? 'Waiting' : 'Deposit'}
        </button>
      </div>

      {opened && stage === 'waiting' && (
        <p className="mt-2.5 text-[10px] leading-relaxed text-ink-faint">
          Opened {opened.reference}. Pay {opened.transferAmount} into {opened.accountNumber} at{' '}
          {opened.bankName}.
          {opened.selfSettling && ' Test mode settles this itself, so just wait.'}
        </p>
      )}

      {stage === 'credited' && (
        <p className="mt-2.5 text-[11px] font-medium text-gain">
          Credited. The balance above has moved.
        </p>
      )}

      {stage === 'error' && error && (
        <p className="mt-2.5 rounded-lg border border-ink px-3 py-2 text-[11px] leading-relaxed">
          {error}
        </p>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-ink-ghost">
        {mode === 'test'
          ? 'Opens a real Flutterwave charge. Test mode pays it, so no money moves.'
          : 'Opens a real Flutterwave charge against live keys.'}
      </p>
    </div>
  );
}

/**
 * Who issued the number, and what it can actually do.
 *
 * A real account number issued against a placeholder identity, in a sandbox,
 * that does not move the balance shown on the dashboard, is three separate
 * claims. Collapsing them into "your account" would be the easy lie.
 */
function Provenance({ account }: { account: ReceivingAccount }) {
  if (account.provider === 'simulated') {
    return (
      <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
        A sample account, so nothing can land in it. Add a Flutterwave key and KORA issues a
        real one here instead.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-1.5">
      <div className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2 py-0.5 text-[10px] text-ink-muted">
        Issued by Flutterwave
        {account.mode === 'test' && ' · test mode'}
      </div>
      <p className="text-[10px] leading-relaxed text-ink-faint">
        {account.testIdentity
          ? 'A real Flutterwave account, opened against a placeholder BVN because KORA has no KYC step yet. In production that number comes from the account holder.'
          : 'Opened against the account holder’s verified identity.'}{' '}
        {account.mode === 'test'
          ? 'Nothing in the sandbox ever pays into a static account, so use Add money below to put funds in.'
          : 'A transfer into it credits the balance above once Flutterwave confirms it.'}
      </p>
    </div>
  );
}

function CopyRow({
  label,
  value,
  mono,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-[0.06em] text-ink-faint">{label}</dt>
        <dd
          className={cn(
            'truncate text-sm',
            mono && 'tabular text-[15px] font-semibold tracking-[0.04em]',
          )}
        >
          {value}
        </dd>
      </div>

      <button
        type="button"
        onClick={onCopy}
        aria-label={'Copy ' + label.toLowerCase()}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors',
          copied
            ? 'border-gain text-gain'
            : 'border-rule text-ink-faint hover:border-ink hover:text-ink',
        )}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" strokeWidth={2} />
        ) : (
          <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
        )}
      </button>
    </div>
  );
}
