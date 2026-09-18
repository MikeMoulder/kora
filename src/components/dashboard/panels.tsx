'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowRight,
  Check,
  Copy,
  Delete,
  Repeat,
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
  name: string;
  symbol: string;
  country: string;
  perNaira: number;
}

export interface CrossRate {
  code: string;
  name: string;
  symbol: string;
  country: string;
  value: number;
}

export interface RatesPayload {
  base: string;
  basePerUsd: number;
  per: number;
  asOf: string;
  source: string;
  stale: boolean;
  rates: CrossRate[];
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

export function SendPanel({
  rates,
  initialAmount,
}: {
  rates: RatesPayload | null;
  /** Seeded when Convert hands its amount over, so the figure is not retyped. */
  initialAmount?: number;
}) {
  const router = useRouter();
  const [beneficiary, setBeneficiary] = useState<Beneficiary>(BENEFICIARIES[0]);
  const [digits, setDigits] = useState(() =>
    initialAmount && initialAmount > 0 ? String(Math.round(initialAmount)) : '100000',
  );
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);

  const amount = Number(digits || '0');
  const payout = rates?.payouts.find((p) => p.code === beneficiary.payoutCurrency) ?? null;
  const receives = payout ? amount * payout.perNaira : null;

  const press = useCallback((key: string) => {
    setDigits((current) => {
      if (key === 'del') return current.slice(0, -1);
      if (current.length >= 12) return current;
      if (current === '0') return key;
      return current + key;
    });
  }, []);

  const send = useCallback(() => {
    const purpose = note.trim() ? ` for ${note.trim()}` : '';
    router.push(
      intentHref(
        `Send ₦${amount.toLocaleString()} to ${beneficiary.name} in ${beneficiary.countryName}${purpose}.`,
      ),
    );
  }, [amount, beneficiary, note, router]);

  if (picking) {
    return (
      <BeneficiaryPicker
        onPick={(b) => {
          setBeneficiary(b);
          setPicking(false);
        }}
        onCancel={() => setPicking(false)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-paper">
          <Flag code={ACCOUNT.country} size={13} />
          NGN &middot;&middot;&middot;&middot; 4471
        </span>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="text-xs text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          Change
        </button>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Monogram name={beneficiary.name} size={42} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{beneficiary.name}</div>
          <div className="truncate text-xs text-ink-faint">{beneficiary.account}</div>
        </div>
      </div>

      <div className="mt-7 text-center">
        <div className="tabular text-[40px] font-semibold leading-none tracking-[-0.03em]">
          &#8358;{amount.toLocaleString()}
        </div>
        <div className="mt-2 text-xs text-ink-faint">
          Balance {formatNaira(ACCOUNT.balance)}
        </div>
      </div>

      <dl className="mt-6 space-y-2 border-t border-rule pt-4 text-xs">
        <Line label="Exchange rate">
          {payout
            ? `₦1 = ${payout.perNaira.toFixed(6)} ${payout.code}`
            : '—'}
        </Line>
        <Line label="Recipient receives">
          {receives !== null && payout ? (
            <span className="font-semibold text-ink">
              {payout.symbol}
              {receives.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          ) : (
            '—'
          )}
        </Line>
        <Line label="Balance after">
          {formatNaira(ACCOUNT.balance - amount)}
        </Line>
        <Line label="Transaction fee">Quoted on the next screen</Line>
      </dl>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note"
        maxLength={60}
        className="mt-4 h-10 w-full rounded-lg border border-rule bg-paper-sunk px-3 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-ink focus:bg-paper"
      />

      <div className="mt-4 grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((key) => (
          <Key key={key} onPress={() => press(key)}>
            {key}
          </Key>
        ))}
        <Key onPress={() => press('000')} className="text-[15px]">
          000
        </Key>
        <Key onPress={() => press('0')}>0</Key>
        <Key onPress={() => press('del')} label="Delete">
          <Delete className="h-4 w-4" strokeWidth={1.8} />
        </Key>
      </div>

      <button
        type="button"
        onClick={send}
        disabled={amount <= 0}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
      >
        Review payment
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
      </button>

      <p className="mt-3 text-center text-[10px] leading-relaxed text-ink-faint">
        Review runs the real corridor engine. Nothing moves until you confirm a quote.
      </p>
    </div>
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

function Key({
  children,
  onPress,
  label,
  className,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className={cn(
        'tabular flex h-11 items-center justify-center rounded-lg bg-paper-sunk text-[17px] font-medium transition-colors hover:bg-paper-edge active:bg-ink active:text-paper',
        className,
      )}
    >
      {children}
    </button>
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
 * Receive.
 *
 * Three fields and a way to copy them, which is the whole of a Nigerian
 * inbound transfer: a payer opens their bank app, types a bank, a NUBAN and
 * checks the name that comes back. Anything else on this panel would be
 * decoration.
 *
 * Deliberately no QR. Nigeria has no scannable standard behind NIP the way
 * Kenya has USSD behind M-Pesa, so a code here would be a picture of a
 * payment method that does not exist. The M-Pesa corridor emits a real
 * scannable because there is a real thing to scan.
 */
export function ReceivePanel() {
  const { receiving } = ACCOUNT;
  const [copied, setCopied] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const full = `${receiving.accountName}\n${receiving.bankName}\n${receiving.accountNumber}`;

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
            {receiving.rail}
          </div>
        </div>
      </div>

      <dl className="mt-5 divide-y divide-rule rounded-xl border border-rule">
        <CopyRow
          label="Account number"
          value={receiving.accountNumber}
          mono
          copied={copied === 'number'}
          onCopy={() => copy('number', receiving.accountNumber)}
        />
        <CopyRow
          label="Bank"
          value={receiving.bankName}
          copied={copied === 'bank'}
          onCopy={() => copy('bank', receiving.bankName)}
        />
        <CopyRow
          label="Account name"
          value={receiving.accountName}
          copied={copied === 'name'}
          onCopy={() => copy('name', receiving.accountName)}
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

      <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
        A sample account, so nothing can actually land in it. The naira rail KORA does run
        is the one Send funds through, and it issues its own collections account when you
        reach a quote.
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

// ── Convert ───────────────────────────────────────────────────────────────

interface ConvertTarget {
  code: string;
  name: string;
  symbol: string;
  /** Null for an asset rather than a country's money. */
  country: string | null;
  /** Units of the target for one naira. */
  perNaira: number;
}

/**
 * Everything the naira can be read against, in one vocabulary.
 *
 * The cross-rate strip quotes per 1,000 naira because that is what reads on a
 * dashboard, and the payout rates quote per naira because the send panel
 * multiplies them by a typed amount. Convert needs one of those, not both, so
 * they are normalised here rather than at every call site that would otherwise
 * have to remember which feed it is holding.
 *
 * USDC is on the list because it is not decoration. It is the asset the
 * corridor actually settles in, which makes it the one conversion KORA
 * genuinely performs rather than merely quotes.
 */
function convertTargets(rates: RatesPayload | null): ConvertTarget[] {
  if (!rates) return [];

  return [
    {
      code: 'USDC',
      name: 'What the corridor settles in',
      symbol: '$',
      country: null,
      perNaira: 1 / rates.basePerUsd,
    },
    ...rates.rates.map((r) => ({
      code: r.code,
      name: r.name,
      symbol: r.symbol,
      country: r.country,
      perNaira: r.value / rates.per,
    })),
    ...rates.payouts.map((p) => ({
      code: p.code,
      name: p.name,
      symbol: p.symbol,
      country: p.country,
      perNaira: p.perNaira,
    })),
  ];
}

/** Large amounts do not need decimals; small ones are useless without them. */
function formatTarget(target: ConvertTarget, value: number) {
  const places = value >= 1000 ? 0 : 2;
  return `${target.symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  })}`;
}

/**
 * Convert.
 *
 * A rate, not a wallet. KORA holds no balance in cedi or boliviano, so this
 * panel deliberately cannot move anything: it reads the same live feed the
 * quote engine reads and shows what the naira is worth against it.
 *
 * The one honest next step from a rate is a payment, so the button hands the
 * amount to the send panel rather than inventing a second path to the
 * corridor. The figure here is mid-market and says so, because the corridor's
 * own quote carries a rail fee and a spread on top and only Review knows them.
 */
export function ConvertPanel({
  rates,
  onQuote,
}: {
  rates: RatesPayload | null;
  onQuote: (amount: number) => void;
}) {
  const targets = useMemo(() => convertTargets(rates), [rates]);
  const [code, setCode] = useState('USDC');
  const [digits, setDigits] = useState('100000');

  const amount = Number(digits || '0');
  const target = targets.find((t) => t.code === code) ?? null;
  const converted = target ? amount * target.perNaira : null;
  const overBalance = amount > ACCOUNT.balance;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper">
          <Repeat className="h-4 w-4" strokeWidth={1.8} />
        </span>
        <div>
          <div className="text-sm font-semibold">Convert</div>
          <div className="text-[11px] text-ink-faint">Live mid-market rate</div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-rule bg-paper-sunk px-3.5 py-3">
        <label
          htmlFor="convert-amount"
          className="text-[10px] uppercase tracking-[0.12em] text-ink-faint"
        >
          You convert
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[22px] font-semibold leading-none">&#8358;</span>
          <input
            id="convert-amount"
            value={amount.toLocaleString()}
            onChange={(e) => setDigits(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
            inputMode="numeric"
            className="tabular w-full bg-transparent text-[22px] font-semibold leading-none tracking-[-0.02em] outline-none"
          />
        </div>
        <div
          className={cn('tabular mt-2 text-[11px]', overBalance ? 'text-loss' : 'text-ink-faint')}
        >
          {overBalance
            ? `More than the balance of ${formatNaira(ACCOUNT.balance)}`
            : `Balance ${formatNaira(ACCOUNT.balance)}`}
        </div>
      </div>

      <div className="my-2 flex justify-center text-ink-faint">
        <ArrowDown className="h-4 w-4" strokeWidth={1.8} />
      </div>

      <div className="rounded-xl border-[1.5px] border-ink px-3.5 py-3">
        <div className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">You get</div>
        <div className="tabular mt-1.5 truncate text-[22px] font-semibold leading-none tracking-[-0.02em]">
          {target && converted !== null ? formatTarget(target, converted) : '—'}
        </div>
        <div className="mt-2 truncate text-[11px] text-ink-faint">
          {target
            ? `₦1 = ${target.perNaira.toFixed(target.perNaira >= 1 ? 4 : 6)} ${target.code}`
            : 'Loading rates'}
        </div>
      </div>

      <div className="mt-4 text-[10px] uppercase tracking-[0.12em] text-ink-faint">Into</div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {targets.map((t) => (
          <button
            key={t.code}
            type="button"
            onClick={() => setCode(t.code)}
            aria-current={t.code === code ? 'true' : undefined}
            title={t.name}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors',
              t.code === code
                ? 'border-ink bg-ink text-paper'
                : 'border-rule text-ink-muted hover:border-ink hover:text-ink',
            )}
          >
            {t.country ? (
              <Flag code={t.country} size={12} />
            ) : (
              <span className="text-[9px]" aria-hidden>
                &#9679;
              </span>
            )}
            {t.code}
          </button>
        ))}

        {targets.length === 0 &&
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-[34px] animate-pulse rounded-lg bg-paper-sunk" />
          ))}
      </div>

      <button
        type="button"
        onClick={() => onQuote(amount)}
        disabled={amount <= 0}
        className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-ghost"
      >
        Quote this as a payment
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
      </button>

      <p className="mt-3 text-[10px] leading-relaxed text-ink-faint">
        Mid-market, from {rates ? rates.source : 'the live feed'}
        {rates ? (rates.stale ? ', cached' : ', live') : ''}. KORA holds no balance in
        another currency, so nothing on this panel moves money. A real payment adds the
        rail fee and the spread, and only the quote at Review knows them.
      </p>
    </div>
  );
}
