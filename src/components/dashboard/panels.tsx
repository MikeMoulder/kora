'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Search,
  Sparkles,
  Star,
} from 'lucide-react';
import { cn, copyText } from '@/lib/utils';
import { Monogram } from './parts';
import { Flag } from '../Flag';
import { Spinner } from '../ui/primitives';
import {
  ACCOUNT,
  BENEFICIARIES,
  formatNaira,
  relativeDay,
  type Beneficiary,
} from '@/lib/demo-data';

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

/**
 * Both panels end at the same place: a sentence handed to the real corridor
 * engine. The manual keypad composes that sentence from fields, the agent
 * reads it from a person. Neither one gets its own payment path, because a
 * second path is a second set of rules to keep honest.
 */
function intentHref(text: string) {
  return `/send?intent=${encodeURIComponent(text)}`;
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

interface SentPayment {
  reference: string;
  recipient: { name: string; countryName: string; wallet: string };
  sent: { amount: number; currency: string };
  delivered: { amount: number; asset: string; hash: string; explorer: string };
}

export function SendPanel({
  rates,
  balance,
  onSent,
}: {
  rates: RatesPayload | null;
  balance: BalancePayload | null;
  onSent?: () => void;
}) {
  const destinations = useMemo(() => destinationsFrom(rates), [rates]);

  const [step, setStep] = useState<'form' | 'review' | 'done'>('form');
  const [picking, setPicking] = useState(false);

  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [account, setAccount] = useState('');
  const [digits, setDigits] = useState('');
  const [note, setNote] = useState('');

  const [quote, setQuote] = useState<KoraQuoteShape | null>(null);
  const [sent, setSent] = useState<SentPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = Number(digits || '0');
  const available = balance?.balance ?? 0;
  const destination = destinations.find((d) => d.country === country) ?? null;

  const ready = name.trim().length > 1 && country !== '' && amount >= 1000;

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
  }, [account, amount, destination, name, note, onSent]);

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

        <div className="mt-4 rounded-xl border border-rule p-3">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">
            {sent.recipient.name}&rsquo;s Pollar wallet
          </div>
          <div className="mt-1 break-all font-mono text-[10px] text-ink-soft">
            {sent.recipient.wallet}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-ink-faint">
            Created by KORA through Pollar. They never signed up for anything.
          </p>
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

        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
        >
          {busy && <Spinner />}
          {busy ? 'Sending' : `Send ${formatNaira(amount)}`}
        </button>

        <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
          Your naira is debited, then KORA delivers USDC from its float to a Pollar wallet
          for {name}. If the delivery fails the naira comes straight back.
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
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="text-xs text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Saved
        </button>
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
            className="h-10 w-full rounded-lg border border-rule bg-paper-sunk px-3 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-ink focus:bg-paper"
          />
        </Field>

        <Field label="Destination">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-10 w-full rounded-lg border border-rule bg-paper-sunk px-3 text-sm outline-none transition-colors focus:border-ink focus:bg-paper"
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
            className="h-10 w-full rounded-lg border border-rule bg-paper-sunk px-3 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-ink focus:bg-paper"
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
            className="h-10 w-full rounded-lg border border-rule bg-paper-sunk px-3 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-ink focus:bg-paper"
          />
        </Field>
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
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
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

/** What the corridor engine returns, narrowed to what this panel reads. */
interface KoraQuoteShape {
  fee: number;
  rate: number;
  rateSource: string;
  receiveUsdc: number;
  /** The engine's own arithmetic. Rendered, never recomputed. */
  breakdown: { label: string; amount: number; currency: string; note?: string }[];
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
  'Send ₦250,000 to Carlos in Bolivia for the brand system',
  'Pay Maria ₦180,000 in Bolivia for milestone three',
  'Send KES 5,000 to Diego in Bolivia tomorrow',
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
export function AgentPanel() {
  const router = useRouter();
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
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper">
          <Sparkles className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div>
          <div className="text-sm font-semibold">Kora Agent</div>
          <div className="text-[11px] text-ink-faint">Say it, do not fill it in</div>
        </div>
      </div>

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
          className="w-full resize-none rounded-xl border border-rule bg-paper-sunk px-3.5 py-3 text-sm leading-relaxed outline-none transition-colors placeholder:text-ink-faint focus:border-ink focus:bg-paper"
        />

        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
        >
          {busy && <Spinner />}
          {busy ? 'Reading' : 'Read this'}
        </button>
      </form>

      {!parsed && !busy && !error && (
        <div className="mt-4 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Try</div>
          {AGENT_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setText(example);
                run(example);
              }}
              className="block w-full rounded-lg border border-rule px-3 py-2 text-left text-xs text-ink-muted transition-colors hover:border-ink hover:text-ink"
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
            <span className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">
              Understood as
            </span>
            <span className="rounded-md border border-rule px-1.5 py-0.5 text-[10px] text-ink-muted">
              {parsed.source === 'gemini' ? 'Gemini and rules' : 'Rule parser'}
            </span>
          </div>

          <dl className="mt-2.5 divide-y divide-rule rounded-xl border border-rule">
            <Slot label="Recipient" value={parsed.intent.recipientName} />
            <Slot label="Destination" value={parsed.intent.destinationCountry} />
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
                parsed.intent.timing === 'scheduled' && parsed.intent.scheduledFor
                  ? new Date(parsed.intent.scheduledFor).toLocaleDateString()
                  : 'Now'
              }
            />
          </dl>

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
            onClick={() => router.push(intentHref(lastText))}
            disabled={!ready}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
          >
            Review payment
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </button>

          <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
            The agent filled that object and stopped. It holds no signer and cannot move
            money. Review runs the corridor engine, and a payment still needs you to confirm
            a quote.
          </p>
        </div>
      )}
    </div>
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

export function BeneficiaryPanel() {
  const router = useRouter();
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
          className="h-10 w-full rounded-lg border border-rule bg-paper-sunk pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-ink focus:bg-paper"
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
            className="group rounded-xl border border-rule p-3 transition-colors hover:border-ink"
          >
            <div className="flex items-center gap-3">
              <Monogram name={b.name} size={38} />
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
                  router.push(intentHref(`Send ₦100,000 to ${b.name} in ${b.countryName}.`))
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
            className="flex w-full items-center gap-3 rounded-xl border border-rule p-3 text-left transition-colors hover:border-ink"
          >
            <Monogram name={b.name} size={36} />
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
          className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-ink px-4 text-[13px] font-medium text-paper transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
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
