'use client';

/**
 * Everything the account knows about one movement.
 *
 * The rows on the overview and in All activity are deliberately spare: a face,
 * a name, a direction and a figure. That is the right amount of information
 * for a list somebody is scanning, and the wrong amount for the one row they
 * stopped on. This panel is where the stopping happens.
 *
 * It invents nothing. Every line is either read straight off the activity item
 * or joined to a scheduled payment the dashboard has already fetched, and a
 * fact the account does not hold is left out rather than filled with a
 * plausible looking blank. That is why an opening history row shows fewer
 * lines than a real one: there is genuinely less to say about money that never
 * moved.
 *
 * The Stellar block is the point of the whole screen. A remittance receipt
 * that cannot be checked by the person holding it is a screenshot, and the one
 * artefact that makes this an account rather than a mockup is a hash somebody
 * can paste into a block explorer we do not control.
 */

import { ArrowUpRight } from 'lucide-react';
import { Avatar } from './parts';
import { Flag } from '../Flag';
import { cn } from '@/lib/utils';
import { formatNaira } from '@/lib/demo-data';
import type { ActivityItem } from '@/lib/account/activity';
import type { ScheduledPaymentShape } from './panels';

/**
 * What a reference says about the movement that carries it.
 *
 * References are minted by this codebase, so their prefixes are a fact rather
 * than a guess: `KORA-PAY` is a send made on the spot, `KORA-SCH` is one that
 * was held and released later, `KORA-DEP` is money arriving. Anything that
 * matches none of them is opening history, and saying so is more useful than
 * inventing a category for it.
 */
function classify(tx: ActivityItem): {
  kind: 'payment' | 'scheduled' | 'deposit' | 'reversal' | 'sample';
  label: string;
} {
  if (!tx.real) return { kind: 'sample', label: 'Opening history, sample data' };
  if (tx.id.endsWith('-REVERSAL')) return { kind: 'reversal', label: 'Money put back' };
  if (tx.id.startsWith('KORA-SCH')) return { kind: 'scheduled', label: 'Scheduled payment' };
  if (tx.id.startsWith('KORA-PAY')) return { kind: 'payment', label: 'Payment' };
  if (tx.id.startsWith('KORA-DEP')) return { kind: 'deposit', label: 'Deposit' };
  return { kind: 'payment', label: 'Account movement' };
}

/** Who told us this happened, in words rather than in an enum. */
const SOURCE_WORDS: Record<NonNullable<ActivityItem['source']>, string> = {
  flutterwave: 'Flutterwave, our Nigerian collections partner',
  corridor: 'The KORA corridor engine',
  simulated: 'Simulated, for the demo',
};

/** Full date and time, spelled out. The rows upstairs already say "2 days ago". */
function fullWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TransactionPanel({
  tx,
  scheduled,
  onBack,
}: {
  tx: ActivityItem;
  /**
   * The scheduled payment this row came from, when it was one.
   *
   * Joined on the reference by the dashboard, which already holds the
   * schedule. A held payment and its ledger entry share one reference by
   * design, so this needs no new endpoint and cannot drift out of step with
   * the list it was matched against.
   */
  scheduled?: ScheduledPaymentShape | null;
  /** Back to wherever the row was clicked. */
  onBack?: { label: string; go: () => void };
}) {
  const incoming = tx.direction === 'in';
  const { kind, label } = classify(tx);
  const outcome = scheduled?.outcome ?? null;

  return (
    <div className="flex h-full flex-col">
      {onBack && (
        <button
          type="button"
          onClick={onBack.go}
          className="press -mt-1 mb-4 w-fit text-[11px] text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          &larr; {onBack.label}
        </button>
      )}

      <div className="flex items-center gap-3">
        <Avatar id={tx.avatarId} name={tx.party} kind={tx.kind} size={52} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium tracking-[-0.01em]">{tx.party}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-faint">{label}</div>
        </div>
      </div>

      <div
        className={cn(
          'tabular mt-5 text-[30px] font-semibold tracking-[-0.02em]',
          incoming ? 'text-gain' : 'text-loss',
        )}
      >
        {formatNaira(tx.amount, { signed: true })}
      </div>

      <div className="mt-1 text-[11.5px] text-ink-faint">{fullWhen(tx.at)}</div>

      <dl className="mt-5 divide-y divide-rule rounded-xl border border-rule">
        <Line label="Reference">
          <span className="tabular">{tx.id}</span>
        </Line>
        <Line label="Direction">{incoming ? 'Money in' : 'Money out'}</Line>
        <Line label="Counterparty">{tx.party}</Line>
        {tx.source && <Line label="Recorded by">{SOURCE_WORDS[tx.source]}</Line>}
        <Line label="Record">
          {tx.real ? 'A movement that actually happened' : 'Opening history, not a real movement'}
        </Line>
      </dl>

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-muted">{tx.detail}</p>

      {/*
        * The route, and only for the movements that have one.
        *
        * Every payment in this app funds through Nigeria and settles in the
        * destination through Pollar, which is a fact about the corridor rather
        * than about this row. Printing it on a deposit or on a piece of
        * opening history would be printing it because it fits, not because it
        * is true.
        */}
      {(kind === 'payment' || kind === 'scheduled') && scheduled && (
        <div className="mt-4 rounded-xl border border-rule px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.06em] text-ink-faint">Route</div>
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <Flag code="NG" />
            <span>Nigeria, bank transfer</span>
            <span className="text-ink-ghost">&rarr;</span>
            <Flag code={scheduled.recipient.country} />
            <span>{scheduled.recipient.countryName}, via Pollar</span>
          </div>
        </div>
      )}

      {scheduled && (
        <dl className="mt-3 divide-y divide-rule rounded-xl border border-rule">
          <Line label="Asked for">{fullWhen(scheduled.createdAt)}</Line>
          <Line label="Due">{fullWhen(scheduled.dueAt)}</Line>
          <Line label="Requested by">
            {scheduled.origin === 'agent' ? 'Kora Agent, from a sentence' : 'The send form'}
          </Line>
          {scheduled.note && <Line label="Note">{scheduled.note}</Line>}
        </dl>
      )}

      {/*
        * The proof, when there is one.
        *
        * A hash is the only line on this screen that does not depend on
        * trusting us, so it gets its own block and a link off our own domain.
        * Rows without one say nothing here rather than showing an empty field,
        * because "Transaction: none" reads like a failure and the truth is
        * that this movement never had a chain leg to record.
        */}
      {outcome?.hash && (
        <div className="mt-4 rounded-xl border border-ink px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.06em] text-ink-faint">
            Settled on Stellar
          </div>

          {outcome.delivered && (
            <div className="tabular mt-1.5 text-[15px] font-semibold tracking-[-0.01em]">
              {outcome.delivered.amount} {outcome.delivered.asset}
            </div>
          )}

          <div className="tabular mt-2 break-all text-[10.5px] leading-relaxed text-ink-faint">
            {outcome.hash}
          </div>

          {outcome.explorer && (
            <a
              href={outcome.explorer}
              target="_blank"
              rel="noreferrer"
              className="press mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium underline-offset-4 hover:underline"
            >
              Check it on stellar.expert
              <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
            </a>
          )}
        </div>
      )}

      {outcome && !outcome.hash && outcome.message && (
        <p className="mt-4 rounded-xl border border-rule px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-muted">
          {outcome.message}
        </p>
      )}

      {!tx.real && (
        <p className="mt-4 text-[10px] leading-relaxed text-ink-faint">
          This row is part of the account&rsquo;s opening history. It is generated from a fixed
          seed so the page has a year of shape behind it, and it is marked here rather than
          left to look like a payment somebody made.
        </p>
      )}
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-[10px] uppercase tracking-[0.06em] text-ink-faint">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-right text-[11.5px]">{children}</dd>
    </div>
  );
}
