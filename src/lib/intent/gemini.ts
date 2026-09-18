/**
 * Intent extraction.
 *
 * The model reads the sentence. The rule parser is what answers when the model
 * cannot be reached, and nothing else.
 *
 * It used to be the other way around: rules ran first and the model was
 * forbidden from overruling a number the regex had already found, on the
 * reasoning that a confident hallucination costs the user money and a regex
 * either matches or does not. The reasoning was sound and the premise was
 * wrong. A regex does not either match or not; it matches something, and on a
 * sentence a person actually writes that something is regularly the wrong
 * number:
 *
 *   "pay Carlos for invoice 3 tomorrow, 250k naira"   read as ₦3
 *   "get 40 thousand naira over to Diego Rojas"       read as ₦40
 *
 * Both were then locked in, because the merge preferred them over a model that
 * had read both correctly. The protection against a wrong number was producing
 * the wrong numbers.
 *
 * So the policy is inverted (see `mergeIntents`). What actually protects the
 * money is downstream of here and always has been: this parser fills a form,
 * a person reads it, and a human confirmation of a reviewed quote is what
 * moves anything. A parser that is right most of the time in front of that
 * check beats one that is confidently wrong in front of it.
 *
 * If there is no API key, or the call fails or times out, the rules result
 * stands and the UI says which parser produced it. There is no silent
 * degradation.
 */

import { GoogleGenAI, Type } from '@google/genai';
import { parseWithRules } from './rules';
import { missingFields, type IntentResult, type PaymentIntent } from './types';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
const TIMEOUT_MS = 8_000;

const SYSTEM_INSTRUCTION = `You extract payment intent from a sentence written by someone sending money abroad.

You are a parser, not an agent. You never execute anything, never invent a recipient, and never guess an amount that is not stated.

Rules:
- Return null for anything the sentence does not state. Null is always better than a guess.
- "destinationCountry" is where the RECIPIENT is, as ISO 3166-1 alpha-2. In "send naira to Carlos in Bolivia" that is BO, not NG.
- "sourceCountry" is where the SENDER is funding from, if stated.
- "currency" is the ISO 4217 code of the amount as the sender wrote it. "bucks" and "dollars" are USD. "naira" is NGN. "shillings" in an East African context is KES.
- "amount" is a number only, no separators or symbols.
- "purpose" is a short noun phrase, lowercase, like "logo design" or "september invoice". Not a sentence.
- "timing" is "scheduled" only if the sentence names a future time. Otherwise "now".
- "scheduledFor" is an ISO-8601 timestamp. Resolve relative dates against the supplied current time. Default to 09:00 local when a date is given with no time.
- "recipientName" is the person's name as written. Never a country, a company or a currency.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    recipientName: { type: Type.STRING, nullable: true },
    destinationCountry: {
      type: Type.STRING,
      nullable: true,
      description: 'ISO 3166-1 alpha-2, uppercase',
    },
    amount: { type: Type.NUMBER, nullable: true },
    currency: { type: Type.STRING, nullable: true, description: 'ISO 4217, uppercase' },
    purpose: { type: Type.STRING, nullable: true },
    timing: { type: Type.STRING, enum: ['now', 'scheduled'] },
    scheduledFor: { type: Type.STRING, nullable: true },
    sourceCountry: { type: Type.STRING, nullable: true },
    note: {
      type: Type.STRING,
      nullable: true,
      description: 'One short sentence on any assumption you made. Null if none.',
    },
  },
  required: ['timing'],
  propertyOrdering: [
    'recipientName',
    'destinationCountry',
    'amount',
    'currency',
    'purpose',
    'timing',
    'scheduledFor',
    'sourceCountry',
    'note',
  ],
};

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function parseIntent(text: string): Promise<IntentResult> {
  /*
   * Run regardless, and cheap: it is synchronous string matching. It is here
   * to fill the fields the model left null and to be the whole answer when the
   * model does not arrive, not to be consulted about what the sentence said.
   */
  const fallback = parseWithRules(text);

  if (!geminiConfigured()) return degraded(fallback, 'No Gemini key is configured.');

  try {
    const model = await callGemini(text);
    if (!model) return degraded(fallback, 'Gemini returned nothing readable.');

    const merged = mergeIntents(fallback.intent, model.intent);

    /*
     * The rule parser's own notes are dropped when the model answered.
     *
     * They explain inferences the rules made — "Funding country inferred from
     * NGN", "Interpreted Friday as the next one" — and once the model is the
     * one deciding those fields, printing the reasoning of the parser that did
     * not decide them is worse than printing nothing.
     */
    return {
      intent: merged,
      source: 'gemini',
      missing: missingFields(merged),
      note: model.note,
    };
  } catch {
    // A parser outage must not take the product down; rules already answered.
    return degraded(fallback, 'Gemini could not be reached, so the rule parser read this.');
  }
}

/**
 * The rules result, labelled as the fallback it is.
 *
 * Said out loud rather than returned quietly. The rule parser is materially
 * worse at this than the model, and somebody looking at a form it filled
 * should be able to tell that is what happened.
 */
function degraded(fallback: IntentResult, why: string): IntentResult {
  return {
    ...fallback,
    note: [why, fallback.note].filter(Boolean).join(' '),
  };
}

/**
 * Merge policy, in one place so it can be audited.
 *
 *   amount          → the model, and only the model
 *   everything else → the model when it said something, rules fill the gaps
 *
 * Amount is the one field with no fallback, which looks like the opposite of
 * caution and is the point. When the model returns null it is saying the
 * sentence named no amount, and that is a reading worth trusting: "pay Carlos
 * for invoice 3 in Bolivia" states no amount at all. Letting the rules fill
 * that gap is how a line item number becomes a payment. A missing amount stops
 * the form and asks; a wrong one does not.
 *
 * The gaps the rules do fill are literal lookups — a currency word, a country
 * name, a weekday — rather than anything inferred from a number.
 */
export function mergeIntents(rules: PaymentIntent, model: PaymentIntent): PaymentIntent {
  return {
    amount: model.amount,
    currency: normaliseCode(model.currency) ?? rules.currency,
    recipientName: model.recipientName ?? rules.recipientName,
    destinationCountry: normaliseCode(model.destinationCountry) ?? rules.destinationCountry,
    sourceCountry: normaliseCode(model.sourceCountry) ?? rules.sourceCountry,
    purpose: model.purpose ?? rules.purpose,
    timing: model.timing ?? rules.timing,
    scheduledFor: model.scheduledFor ?? rules.scheduledFor,
  };
}

async function callGemini(
  text: string,
): Promise<{ intent: PaymentIntent; note: string | null } | null> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const response = await withTimeout(
    ai.models.generateContent({
      model: MODEL,
      contents: `Current time: ${new Date().toISOString()}\n\nSentence: ${text}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    }),
    TIMEOUT_MS,
  );

  const raw = response.text;
  if (!raw) return null;

  const parsed = JSON.parse(raw) as Partial<PaymentIntent> & { note?: string | null };

  return {
    intent: {
      recipientName: str(parsed.recipientName),
      destinationCountry: normaliseCode(str(parsed.destinationCountry)),
      amount: typeof parsed.amount === 'number' && parsed.amount > 0 ? parsed.amount : null,
      currency: normaliseCode(str(parsed.currency)),
      purpose: str(parsed.purpose),
      timing: parsed.timing === 'scheduled' ? 'scheduled' : 'now',
      scheduledFor: instant(str(parsed.scheduledFor)),
      sourceCountry: normaliseCode(str(parsed.sourceCountry)),
    },
    note: str(parsed.note ?? null),
  };
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed && trimmed.toLowerCase() !== 'null' ? trimmed : null;
}

/**
 * The model's timestamp, re-emitted as an unambiguous instant.
 *
 * Asked for ISO-8601, it returns things like `2026-09-22T09:00:00` — a real
 * date with no zone on the end. Every reader downstream uses `Date.parse`,
 * which reads a date-time with no designator as local time, so the same string
 * means one thing on a Lagos laptop and another on a UTC host, and the payment
 * a person scheduled for nine in the morning is booked for an hour they did
 * not pick.
 *
 * Parsed once here and written back with a zone on it. The rule parser has
 * always emitted `toISOString()`; this is the model's output being held to the
 * same shape rather than every consumer being taught to guess.
 *
 * Anything unparseable becomes null. A date nobody can read is not a date, and
 * the merge then falls through to whatever the rules made of the sentence.
 */
function instant(v: string | null): string | null {
  if (!v) return null;
  const at = new Date(v);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

function normaliseCode(v: string | null | undefined): string | null {
  if (!v) return null;
  const code = v.trim().toUpperCase();
  return /^[A-Z]{2,3}$/.test(code) ? code : null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini timed out after ${ms}ms`)), ms),
    ),
  ]);
}
