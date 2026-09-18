/**
 * Model-assisted intent extraction.
 *
 * The model runs *after* the deterministic parser and is merged under a fixed
 * policy (see `mergeIntents`). The rule that matters:
 *
 *   The model may not overrule a number the parser could already read.
 *
 * Amount and currency are the two fields where a confident hallucination
 * costs the user money, and they are exactly the two fields a regex handles
 * well. So the model is given the whole sentence and allowed to contribute
 * everything — recipient, destination, purpose, relative dates, loose phrasing
 * — but on `amount` and `currency` it can only fill a gap, never replace.
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
  const baseline = parseWithRules(text);
  if (!geminiConfigured()) return baseline;

  try {
    const model = await callGemini(text);
    if (!model) return baseline;

    const merged = mergeIntents(baseline.intent, model.intent);
    const notes = [baseline.note, model.note].filter(Boolean) as string[];

    return {
      intent: merged,
      source: 'gemini',
      missing: missingFields(merged),
      note: notes.length ? notes.join(' ') : null,
    };
  } catch {
    // A parser outage must not take the product down; rules already answered.
    return baseline;
  }
}

/**
 * Merge policy, in one place so it can be audited:
 *   amount, currency → rules win when present (money is not a guess)
 *   everything else  → model wins when non-null, rules fill the gaps
 */
export function mergeIntents(rules: PaymentIntent, model: PaymentIntent): PaymentIntent {
  return {
    amount: rules.amount ?? model.amount,
    currency: rules.currency ?? normaliseCode(model.currency),
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
      scheduledFor: str(parsed.scheduledFor),
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
