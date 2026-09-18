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
 * or off a record joined to it by reference, and a fact the account does not
 * hold is left out rather than filled with a plausible looking blank.
 *
 * Two records can be joined, and which one arrives says nothing about how much
 * the screen should show:
 *
 *   scheduled payment  from the schedule store, via the dashboard
 *   receipt            from the receipt store, alongside the activity row
 *
 * They are folded into one shape before anything is rendered. A payment sent
 * on the spot and one held until Friday are the same event with different
 * timing, and the panel used to treat them as different kinds of thing purely
 * because only one of them had a record to read. The scheduled one showed its
 * route and its hash; the immediate one showed four lines and a sentence.
 *
 * What the timing genuinely changes is small and is the only thing still
 * branched on: a payment that was asked for and sent in the same instant has
 * no "asked for" and no "due" worth printing, so it prints neither.
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
import { BENEFICIARIES, formatNaira } from '@/lib/demo-data';
import type { ActivityItem } from '@/lib/account/activity';
import type { PaymentOutcome } from '@/lib/payments/receipt';
import type { ScheduledPaymentShape } from './panels';

/**
 * What a reference says about the movement that carries it.
 *
 * References are minted by this codebase, so their prefixes are a fact rather
 * than a guess: `KORA-PAY` is a send made on the spot, `KORA-SCH` is one that
 * was held and released later, `KORA-DEP` is money arriving. Anything that
 * matches none of them is still a movement that happened, so it is named as
 * one rather than given an invented category.
 */
function classify(tx: ActivityItem): {
  kind: 'payment' | 'scheduled' | 'deposit' | 'reversal';
  label: string;
} {
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

/**
 * The two records, folded into one.
 *
 * Every field is optional because the two sources genuinely know different
 * amounts, and a payment made before either store existed knows almost
 * nothing. Nothing here is defaulted: an absent field means the account does
 * not hold that fact, and the panel skips the line rather than printing a
 * blank one.
 */
interface PaymentRecord {
  route: { country: string; countryName: string } | null;
  /** Null for a payment sent on the spot. There was no waiting to describe. */
  createdAt: string | null;
  dueAt: string | null;
  origin: 'agent' | 'form' | null;
  note: string | null;
  outcome: PaymentOutcome | null;
}

/**
 * Where a payment was going, when nothing joined to it says so.
 *
 * Read out of the entry's own wording, which named the destination in a
 * sentence this codebase wrote and therefore knows the shape of:
 *
 *   Payment to Carlos Mamani in Bolivia, logo and brand system.
 *   Held for Carlos Mamani in Bolivia, logo and brand system. Due 18 Sept...
 *
 * The obvious shortcut is to look the recipient up in the beneficiary book and
 * take the country from there. That is wrong, and this ledger proves it: the
 * same contractor has been paid in Bolivia twice and in Brazil once. The book
 * says where somebody usually is; the entry says where this payment actually
 * went, and a receipt has to answer the second question.
 *
 * Anchored to the two openings this codebase writes rather than hunting for
 * the word "in" anywhere in the line, so a note that happens to contain one
 * cannot be read as a country.
 *
 * A fallback, not a parser to build on. Payments made from here on carry a
 * receipt with the destination recorded as an ISO code, and this exists for
 * the ones made before that.
 */
const DESTINATION = /^(?:Payment to|Held for) .+? in ([^,.]+)[,.]/;

/**
 * The ISO code for a country name, from the book rather than a hardcoded list.
 *
 * Derived from the beneficiaries, which is where every destination this
 * account has ever paid into came from. A name it cannot resolve gets no
 * route at all rather than a route with a missing flag in it: half a corridor
 * drawn on a receipt reads as a rendering bug, and the payment's own sentence
 * is printed underneath either way.
 */
function codeForCountry(name: string): string | null {
  const wanted = name.trim().toLowerCase();
  return BENEFICIARIES.find((b) => b.countryName.toLowerCase() === wanted)?.country ?? null;
}

function routeFromDetail(detail: string): { country: string; countryName: string } | null {
  const found = DESTINATION.exec(detail);
  if (!found) return null;

  const countryName = found[1].trim();
  const country = codeForCountry(countryName);

  return country ? { country, countryName } : null;
}

/**
 * One record for the panel, whichever store answered.
 *
 * The scheduled payment wins where both exist, which they never currently do:
 * it is the richer of the two, carrying the wait as well as the delivery.
 */
function fold(
  tx: ActivityItem,
  scheduled?: ScheduledPaymentShape | null,
): PaymentRecord {
  if (scheduled) {
    return {
      route: {
        country: scheduled.recipient.country,
        countryName: scheduled.recipient.countryName,
      },
      createdAt: scheduled.createdAt,
      dueAt: scheduled.dueAt,
      origin: scheduled.origin,
      note: scheduled.note,
      outcome: scheduled.outcome,
    };
  }

  const receipt = tx.receipt;

  if (receipt) {
    return {
      route: {
        country: receipt.recipient.country,
        countryName: receipt.recipient.countryName,
      },
      createdAt: null,
      dueAt: null,
      origin: receipt.origin,
      note: receipt.note,
      outcome: receipt.outcome,
    };
  }

  /*
   * Nothing joined. This is every payment made before receipts were written,
   * and the route is the one thing still recoverable, from the beneficiary
   * book rather than from anything the payment itself left behind.
   *
   * The hash is not recoverable and no attempt is made to find one. It was
   * never stored, and matching a Stellar transaction back to a reference by
   * amount and rough timing would eventually print somebody else's hash on
   * this receipt. A missing proof is a gap; a wrong proof is a lie.
   */
  return {
    route: routeFromDetail(tx.detail),
    createdAt: null,
    dueAt: null,
    origin: null,
    note: null,
    outcome: null,
  };
}

/** Who asked for it, in words. */
const ORIGIN_WORDS: Record<'agent' | 'form', string> = {
  agent: 'Kora Agent, from a sentence',
  form: 'The send form',
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

  const record = fold(tx, scheduled);
  const { outcome } = record;

  /*
   * Whether this movement is the kind that has a route at all.
   *
   * A deposit arrives from a Nigerian bank and stops; a reversal is money
   * coming back the way it went. Neither crosses the corridor, so neither gets
   * a corridor drawn on it however much the rest of the record knows.
   */
  const outbound = kind === 'payment' || kind === 'scheduled';

  /* Both halves of the timing, or neither. An immediate send has no wait. */
  const waited = record.createdAt !== null && record.dueAt !== null;
  const hasTiming = waited || record.origin !== null || record.note !== null;

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
      </dl>

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-muted">{tx.detail}</p>

      {/*
        * The route, and only for the movements that have one.
        *
        * Every payment in this app funds through Nigeria and settles in the
        * destination through Pollar, which is a fact about the corridor rather
        * than about this row. Printing it on a deposit would be printing it
        * because it fits, not because it is true.
        */}
      {outbound && record.route && (
        <div className="mt-4 rounded-xl border border-rule px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[0.06em] text-ink-faint">Route</div>
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <Flag code="NG" />
            <span>Nigeria, bank transfer</span>
            <span className="text-ink-ghost">&rarr;</span>
            <Flag code={record.route.country} />
            <span>{record.route.countryName}, via Pollar</span>
          </div>
        </div>
      )}

      {/*
        * When it was asked for, when it went, and who asked.
        *
        * "Asked for" and "Due" are printed only for a payment that waited. On
        * one sent the moment it was asked for they would be the same timestamp
        * twice, which reads as a screen padding itself out; the instant is
        * already at the top of the panel under the amount.
        */}
      {hasTiming && (
        <dl className="mt-3 divide-y divide-rule rounded-xl border border-rule">
          {waited && <Line label="Asked for">{fullWhen(record.createdAt!)}</Line>}
          {waited && <Line label="Due">{fullWhen(record.dueAt!)}</Line>}
          {record.origin && (
            <Line label="Requested by">{ORIGIN_WORDS[record.origin]}</Line>
          )}
          {record.note && <Line label="Note">{record.note}</Line>}
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
