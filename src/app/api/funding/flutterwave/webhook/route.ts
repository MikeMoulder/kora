import { NextResponse } from 'next/server';
import { store } from '@/lib/corridor/store';
import {
  hasWebhookSecret,
  verifyTransaction,
  webhookSignatureValid,
} from '@/lib/flutterwave/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Flutterwave collections webhook.
 *
 * This is the step that turns the Nigerian leg from semi manual into a real
 * corridor. Before it, a human read a bank statement and clicked confirm.
 * Now Flutterwave says the money landed and the corridor checks that claim
 * before crediting anything.
 *
 * Three rules, in order, and none of them is optional:
 *
 *  1. Authenticate. Flutterwave sends the configured secret in `verif-hash`.
 *     Anyone can POST here, so an unsigned request is discarded.
 *  2. Never trust the body. The payload says a payment succeeded; only
 *     Flutterwave's own verify endpoint says whether it did. A forged body
 *     with a valid header would otherwise credit a corridor payment.
 *  3. Check the money. A verified transaction for the wrong amount or the
 *     wrong currency is not the payment we quoted, and short paying a
 *     corridor must not release the full USDC.
 *
 * Flutterwave treats any non-200 as a failure and retries three times at
 * thirty minute intervals. So a request we have already handled, or one for
 * a reference we do not know, answers 200: both are settled outcomes and
 * retrying them would change nothing.
 */

interface WebhookBody {
  event?: string;
  data?: {
    id?: number;
    tx_ref?: string;
    status?: string;
    amount?: number;
    currency?: string;
  };
}

const ack = (detail: string) => NextResponse.json({ ok: true, detail }, { status: 200 });

export async function POST(request: Request) {
  // 1. Authenticate.
  if (!hasWebhookSecret()) {
    // Refusing is the safe default. An endpoint that accepts everything
    // because nobody configured it would credit payments on a stranger's POST,
    // and answering 401 makes the misconfiguration visible in Flutterwave's
    // own delivery log rather than silently crediting.
    return NextResponse.json(
      { ok: false, error: 'No FLW_SECRET_HASH configured on this server.' },
      { status: 401 },
    );
  }

  if (!webhookSignatureValid(request.headers.get('verif-hash'))) {
    return NextResponse.json({ ok: false, error: 'Bad signature.' }, { status: 401 });
  }

  let body: WebhookBody;

  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Body was not JSON.' }, { status: 400 });
  }

  const data = body.data ?? {};
  const reference = data.tx_ref;

  if (body.event !== 'charge.completed') {
    return ack(`Ignored event ${body.event ?? 'with no name'}.`);
  }

  if (!reference || data.id === undefined) {
    return ack('Ignored a charge with no reference or id.');
  }

  const record = await store.get(reference);

  if (!record) {
    // Another integration on the same Flutterwave account, or a reference
    // this process no longer holds. Not our payment, and not an error.
    return ack(`No funding request for ${reference}.`);
  }

  if (record.state.status === 'funded') {
    return ack(`${reference} was already funded.`);
  }

  // 2. Never trust the body.
  const verified = await verifyTransaction(data.id);

  if (!verified.ok) {
    return ack(`Could not verify ${reference} with Flutterwave: ${verified.code}.`);
  }

  if (verified.data.status !== 'successful') {
    await store.append(
      reference,
      record.state.status,
      `Flutterwave reported ${reference} as ${verified.data.status}. Nothing credited.`,
    );
    return ack(`${reference} is ${verified.data.status}, not successful.`);
  }

  // 3. Check the money.
  if (verified.data.txRef !== reference) {
    return ack(`Verified transaction points at ${verified.data.txRef}, not ${reference}.`);
  }

  if (verified.data.currency !== record.request.currency) {
    await store.append(
      reference,
      record.state.status,
      `Flutterwave settled ${reference} in ${verified.data.currency}, but it was quoted in ${record.request.currency}. Held for an operator.`,
    );
    return ack('Currency mismatch, held.');
  }

  if (verified.data.amount < record.request.amount) {
    await store.append(
      reference,
      record.state.status,
      `Flutterwave settled ${verified.data.amount.toLocaleString()} ${verified.data.currency} against a quote of ${record.request.amount.toLocaleString()}. Short paid, so nothing was released. Held for an operator.`,
    );
    return ack('Underpaid, held.');
  }

  const funded = await store.append(
    reference,
    'funded',
    `Flutterwave confirmed ${verified.data.amount.toLocaleString()} ${verified.data.currency} against ${reference}, ref ${verified.data.flwRef}. Verified with Flutterwave, not taken from the webhook body.`,
  );

  if (funded) funded.state.fundedAmountUsdc = record.request.receiveUsdc;

  return ack(`${reference} funded.`);
}

/**
 * Flutterwave only ever POSTs here. A GET is someone checking the URL exists,
 * and it should never reveal whether a reference is known.
 */
export function GET() {
  return NextResponse.json(
    { ok: true, detail: 'KORA Flutterwave collections webhook. POST only.' },
    { status: 200 },
  );
}
