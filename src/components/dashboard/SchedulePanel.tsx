'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, RowSkeleton } from './parts';
import { formatDue, type ScheduledPaymentShape } from './panels';
import { formatNaira } from '@/lib/demo-data';

/**
 * Payments that have not happened yet.
 *
 * Its own module rather than another block in `panels.tsx`, which was already
 * seventeen hundred lines before this. Nothing here is shared with the send
 * flow except the payload type and one date formatter.
 */

export interface SchedulePayload {
  held: ScheduledPaymentShape[];
  done: ScheduledPaymentShape[];
  /** Reserved naira still waiting to be delivered. */
  heldTotal: number;
  currency: string;
  /** Whether the list survives a server restart. */
  durable: boolean;
  /**
   * What is expected to fire due payments. `dashboard` means this browser
   * polls; `cron` means a runner secret is set and something external does.
   */
  runner: 'cron' | 'dashboard';
}

/**
 * The scheduled list, and the thing that sends it.
 *
 * This hook does two jobs and one of them spends money, so it is worth being
 * explicit. `refresh` reads. `run` asks the server to send everything that has
 * fallen due, and it is the only thing in the entire app that triggers a
 * scheduled payment.
 *
 * Whether it does the second job depends on the deployment, and the server
 * decides rather than this file. With no runner secret set the browser is the
 * scheduler, which is the development default. With one set, the route refuses
 * browsers outright and a timer on a host we control calls it every minute;
 * this hook then reads and never runs. Production is the second case.
 *
 * The panel used to print which of the two was live. It no longer does. The
 * browser-driven mode is a development convenience rather than a way anybody
 * runs this, and a panel that explains it is teaching the reader about a
 * deployment that does not exist.
 *
 * The interval is a minute: long enough that an open tab is not hammering a
 * route that spends from a treasury, short enough that "due in a minute"
 * during a demo means roughly a minute.
 */
export function useSchedule(onRan?: () => void) {
  const [schedule, setSchedule] = useState<SchedulePayload | null>(null);

  /*
   * Whether this browser should be driving the runner at all.
   *
   * Held in a ref rather than read off `schedule`, because the polling effect
   * must not tear down and rebuild its interval every time the list changes.
   * Reading it through a ref keeps the effect's dependencies stable while
   * still letting the first response switch the behaviour off.
   *
   * It starts false. A configured deployment answers 401 to a browser, and
   * firing one request to find that out on every page load is a request whose
   * only possible outcome is a console error.
   */
  const shouldPoll = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const body = await fetch('/api/schedule', { cache: 'no-store' }).then((r) => r.json());
      if (body?.ok) {
        const payload = body.data as SchedulePayload;
        shouldPoll.current = payload.runner === 'dashboard';
        setSchedule(payload);
      }
    } catch {
      // The panel keeps its loading state, which is honest: it does not know.
    }
  }, []);

  const run = useCallback(async () => {
    /*
     * A cron deployment is not this browser's business.
     *
     * The route would refuse it anyway, since the secret cannot be shipped to
     * a page, so this is not the security boundary. It is the difference
     * between a dashboard that quietly does nothing and one that logs a 401
     * every sixty seconds for the length of a demo.
     */
    if (!shouldPoll.current) return;

    try {
      const body = await fetch('/api/schedule/run', { method: 'POST' }).then((r) => r.json());

      /*
       * The dashboard is only told when something actually moved.
       *
       * A tick that finds nothing due is the overwhelmingly common case, and
       * refreshing the balance, the activity list and the spend chart every
       * minute to redraw three unchanged numbers is work nobody asked for.
       */
      if (body?.ok && (body.data.sent > 0 || body.data.failed > 0)) {
        onRan?.();
        await refresh();
      }
    } catch {
      // Nothing to show. The payment stays held and the next tick tries again.
    }
  }, [onRan, refresh]);

  useEffect(() => {
    /*
     * Read first, then run. `refresh` is what sets `shouldPoll`, so running
     * before it has answered would either fire a request a cron deployment
     * refuses, or skip the first tick on one that wanted it.
     */
    void refresh().then(run);

    const timer = setInterval(run, 60_000);
    return () => clearInterval(timer);
  }, [refresh, run]);

  return { schedule, refresh, run };
}

/**
 * The panel.
 *
 * Two lists with the reserved total above them, and the order is the argument.
 * What is still coming is what somebody opens this to check. What already went
 * is a receipt, and a receipt only matters once you have gone looking for it.
 */
export function SchedulePanel({
  schedule,
  onChange,
}: {
  schedule: SchedulePayload | null;
  onChange?: () => void;
}) {
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCallback(
    async (reference: string) => {
      setCancelling(reference);
      setError(null);

      try {
        const body = await fetch('/api/schedule/' + reference, { method: 'DELETE' }).then((r) =>
          r.json(),
        );
        if (!body.ok) throw new Error(body.error ?? 'That could not be cancelled.');
        onChange?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That could not be cancelled.');
      } finally {
        setCancelling(null);
      }
    },
    [onChange],
  );

  if (!schedule) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 3 }, (_, n) => (
          <RowSkeleton key={n} index={n} />
        ))}
      </ul>
    );
  }

  const nothing = schedule.held.length === 0 && schedule.done.length === 0;

  return (
    <div className="flex h-full flex-col">
      {schedule.held.length > 0 && (
        <div className="leg-ours rounded-xl px-3.5 py-3">
          <div className="text-[10px] uppercase tracking-[0.12em] opacity-70">Held</div>
          <div className="tabular mt-0.5 text-[22px] font-bold leading-none tracking-[-0.03em]">
            {formatNaira(schedule.heldTotal)}
          </div>
          <div className="mt-1.5 text-[10px] leading-relaxed">
            Already off your balance, across {schedule.held.length}{' '}
            {schedule.held.length === 1 ? 'payment' : 'payments'}. Cancel one and it comes
            back.
          </div>
        </div>
      )}

      {nothing && (
        <div className="rounded-xl border border-dashed border-rule px-4 py-8 text-center">
          <p className="text-xs text-ink-muted">Nothing scheduled.</p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
            Tell Kora Agent to pay somebody tomorrow, or pick Schedule on the send form.
            The naira is reserved when you book it, not when it goes.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-ink px-3 py-2.5 text-[11px] leading-relaxed">
          {error}
        </p>
      )}

      {schedule.held.length > 0 && (
        <div className="mt-4">
          <Label>Coming up</Label>
          <ul className="mt-2 space-y-2">
            {schedule.held.map((payment) => (
              <HeldRow
                key={payment.reference}
                payment={payment}
                busy={cancelling === payment.reference}
                onCancel={() => cancel(payment.reference)}
              />
            ))}
          </ul>
        </div>
      )}

      {schedule.done.length > 0 && (
        <div className="mt-5">
          <Label>Already run</Label>
          <ul className="mt-2 space-y-2">
            {schedule.done.slice(0, 8).map((payment) => (
              <DoneRow key={payment.reference} payment={payment} />
            ))}
          </ul>
        </div>
      )}

      {/*
        * One warning left, and it is about losing records rather than about
        * who fires them.
        *
        * The note that used to sit here described the browser driving due
        * payments. A timer on a host we control does that now, every minute,
        * so the sentence described a development default rather than the
        * product, and a panel explaining a problem the deployment does not
        * have is a panel teaching somebody the wrong thing about it.
        *
        * Durability is a different question and still worth saying out loud,
        * because a store that forgets is a store that forgets money somebody
        * has already had taken off their balance. Production has Redis, so
        * this stays silent there too.
        */}
      {!schedule.durable && (
        <p className="mt-5 text-[10px] leading-relaxed text-ink-faint">
          This list is held in the server process and will not survive a restart.
        </p>
      )}
    </div>
  );
}

/** A payment still waiting, with the way to stop it. */
function HeldRow({
  payment,
  busy,
  onCancel,
}: {
  payment: ScheduledPaymentShape;
  busy: boolean;
  onCancel: () => void;
}) {
  const overdue = Date.parse(payment.dueAt) <= Date.now();

  return (
    <li className="rounded-xl border border-rule px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar id={payment.recipient.avatarId} name={payment.recipient.name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{payment.recipient.name}</div>
          <div className="truncate text-[10px] text-ink-faint">
            {payment.note ?? payment.recipient.countryName}
          </div>
        </div>
        <div className="tabular shrink-0 text-xs font-semibold">
          {formatNaira(payment.amount)}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] text-ink-muted">
          {/*
            * "Due now" rather than a time in the past.
            *
            * A payment whose moment has passed and which has not run yet is
            * waiting on the next tick. Printing the original time for it would
            * read as a schedule that was missed rather than one about to
            * happen, which is the opposite of what is true.
            */}
          {overdue ? 'Due now, sends on the next check' : formatDue(payment.dueAt)}
          {payment.origin === 'agent' && ' · from the agent'}
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="press shrink-0 rounded-md border border-rule px-2 py-1 text-[10px] text-ink-muted hover:border-ink hover:text-ink disabled:opacity-50"
        >
          {busy ? 'Cancelling' : 'Cancel'}
        </button>
      </div>
    </li>
  );
}

/** A payment that has run, whichever way it went. */
function DoneRow({ payment }: { payment: ScheduledPaymentShape }) {
  const sent = payment.status === 'sent';

  return (
    <li className="rounded-xl border border-rule px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar id={payment.recipient.avatarId} name={payment.recipient.name} size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{payment.recipient.name}</div>
          <div className="truncate text-[10px] text-ink-faint">
            {STATUS_WORDS[payment.status]}
            {payment.outcome?.at ? ' · ' + formatDue(payment.outcome.at) : ''}
          </div>
        </div>
        <div
          className={cn(
            'tabular shrink-0 text-xs',
            sent ? 'font-semibold' : 'text-ink-faint line-through',
          )}
        >
          {formatNaira(payment.amount)}
        </div>
      </div>

      {sent && payment.outcome?.explorer && (
        <a
          href={payment.outcome.explorer}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex items-center gap-1 text-[10px] text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          {payment.outcome.delivered
            ? payment.outcome.delivered.amount.toFixed(7) +
              ' ' +
              payment.outcome.delivered.asset +
              ' on Stellar'
            : 'View on Stellar'}
          <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
        </a>
      )}

      {payment.status === 'failed' && payment.outcome?.message && (
        <p className="mt-2 text-[10px] leading-relaxed text-ink-muted">
          {payment.outcome.message}
        </p>
      )}
    </li>
  );
}

/**
 * What each terminal state is called, in words rather than in status codes.
 *
 * `cancelled` and `failed` both say the naira came back, because that is the
 * question somebody has when they see a payment in this list that did not go,
 * and it is a different question from why it did not go.
 */
const STATUS_WORDS: Record<ScheduledPaymentShape['status'], string> = {
  held: 'Waiting',
  sent: 'Sent',
  cancelled: 'Cancelled, naira returned',
  failed: 'Did not go, naira returned',
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">{children}</div>
  );
}
