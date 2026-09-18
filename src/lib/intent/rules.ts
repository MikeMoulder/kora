/**
 * Deterministic intent parser.
 *
 * The fallback. It answers when Gemini has no key, fails or times out, and it
 * keeps the demo runnable with no API key, no network and no latency. It is
 * not consulted about what a sentence meant when the model is available; see
 * the policy in `gemini.ts` for why that changed.
 *
 * It used to run first on the grounds that a regex cannot hallucinate an
 * amount. It cannot, but it can read the wrong one, which costs exactly the
 * same and is harder to notice. Two of the ways it did are fixed below and
 * both are worth knowing about, because they are the shape of the problem
 * rather than two typos:
 *
 *   - it took the first number-like thing it saw, so "invoice 3 ... 250k
 *     naira" was three naira
 *   - it scaled "k" and "m" but not the words, so "40 thousand naira" was
 *     forty
 *
 * A regex over a sentence somebody typed does not either match or not. It
 * matches something.
 */

import { EMPTY_INTENT, missingFields, type IntentResult, type PaymentIntent } from './types';

const CURRENCY_SYMBOLS: Record<string, string> = {
  '₦': 'NGN',
  '₵': 'GHS',
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
};

/** Written currency names and colloquialisms, longest-first at match time. */
const CURRENCY_WORDS: Record<string, string> = {
  naira: 'NGN',
  ngn: 'NGN',
  kes: 'KES',
  shilling: 'KES',
  shillings: 'KES',
  ksh: 'KES',
  bob: 'BOB',
  boliviano: 'BOB',
  bolivianos: 'BOB',
  ghs: 'GHS',
  cedi: 'GHS',
  cedis: 'GHS',
  usd: 'USD',
  usdc: 'USD',
  dollar: 'USD',
  dollars: 'USD',
  bucks: 'USD',
  ugx: 'UGX',
  zar: 'ZAR',
  rand: 'ZAR',
};

const COUNTRIES: Record<string, string> = {
  bolivia: 'BO',
  bolivian: 'BO',
  nigeria: 'NG',
  nigerian: 'NG',
  kenya: 'KE',
  kenyan: 'KE',
  ghana: 'GH',
  ghanaian: 'GH',
  uganda: 'UG',
  ugandan: 'UG',
  'south africa': 'ZA',
  brazil: 'BR',
  colombia: 'CO',
  mexico: 'MX',
};

/** Currencies whose home country tells us where the sender is funding from. */
const CURRENCY_HOME: Record<string, string> = {
  NGN: 'NG',
  KES: 'KE',
  GHS: 'GH',
  UGX: 'UG',
  ZAR: 'ZA',
  BOB: 'BO',
};

export function parseWithRules(text: string): IntentResult {
  const intent: PaymentIntent = { ...EMPTY_INTENT };
  const lower = text.toLowerCase();
  const notes: string[] = [];

  // ── Amount + currency ────────────────────────────────────────────────────
  const amountMatch = matchAmount(text);
  if (amountMatch) {
    intent.amount = amountMatch.amount;
    intent.currency = amountMatch.currency;
  }

  // A currency named away from the number, e.g. "80 bucks" handled above but
  // "pay 80 to Carlos in naira" is not.
  if (intent.amount !== null && !intent.currency) {
    for (const [word, code] of sortedWords()) {
      if (new RegExp(`\\b${word}\\b`).test(lower)) {
        intent.currency = code;
        break;
      }
    }
  }

  // ── Destination country ──────────────────────────────────────────────────
  // Prefer an explicit "in/to <country>" before a bare mention, so
  // "Send NGN from Nigeria to Carlos in Bolivia" resolves to BO, not NG.
  const directed = lower.match(
    /\b(?:in|to|based in|living in|over in)\s+(south africa|bolivia|nigeria|kenya|ghana|uganda|brazil|colombia|mexico)\b/,
  );
  if (directed) {
    intent.destinationCountry = COUNTRIES[directed[1]];
  } else {
    for (const [name, code] of Object.entries(COUNTRIES)) {
      if (new RegExp(`\\b${name}\\b`).test(lower)) {
        intent.destinationCountry = code;
        break;
      }
    }
  }

  // ── Source country ───────────────────────────────────────────────────────
  const fromMatch = lower.match(
    /\bfrom\s+(south africa|bolivia|nigeria|kenya|ghana|uganda|brazil|colombia|mexico)\b/,
  );
  if (fromMatch) {
    intent.sourceCountry = COUNTRIES[fromMatch[1]];
  } else if (intent.currency && CURRENCY_HOME[intent.currency]) {
    intent.sourceCountry = CURRENCY_HOME[intent.currency];
    notes.push(`Funding country inferred from ${intent.currency}.`);
  }

  // A country cannot be both ends of a corridor.
  if (
    intent.sourceCountry &&
    intent.destinationCountry &&
    intent.sourceCountry === intent.destinationCountry
  ) {
    intent.sourceCountry = null;
  }

  // ── Recipient ────────────────────────────────────────────────────────────
  intent.recipientName = matchRecipient(text);

  // ── Purpose ──────────────────────────────────────────────────────────────
  const purpose = text.match(
    /\bfor\s+(?:his|her|their|the|a|an)?\s*([a-z0-9][a-z0-9 \-']{2,40}?)(?:\s*[.,;]|\s+(?:in|to|on|by|tomorrow|today|now)\b|$)/i,
  );
  if (purpose) {
    const cleaned = purpose[1].trim().replace(/\s+/g, ' ');
    // "for 100,000" is an amount, not a purpose.
    if (!/^\d/.test(cleaned)) intent.purpose = cleaned;
  }

  // ── Timing ───────────────────────────────────────────────────────────────
  const timing = matchTiming(lower);
  intent.timing = timing.timing;
  intent.scheduledFor = timing.scheduledFor;
  if (timing.note) notes.push(timing.note);

  return {
    intent,
    source: 'rules',
    missing: missingFields(intent),
    note: notes.length ? notes.join(' ') : null,
  };
}

function sortedWords(): [string, string][] {
  return Object.entries(CURRENCY_WORDS).sort((a, b) => b[0].length - a[0].length);
}

/**
 * The amount, preferring one that says what currency it is in.
 *
 * The order is the whole design. A figure written next to a currency is one
 * somebody meant as money; a bare number in a sentence about money might be an
 * invoice number, a milestone, a quantity or a date. So every currency-anchored
 * form is searched across the entire sentence before a bare number is
 * considered anywhere in it.
 *
 * Each pass scans all of its matches rather than testing only the first. That
 * is the fix for the worst reading this parser produced: given "pay Carlos for
 * invoice 3 tomorrow, 250k naira", the suffixed pass used to match "3 tomorrow"
 * first, find that "tomorrow" is not a currency, and give up — leaving the bare
 * pass to answer three. The number it wanted was further along the same line.
 */
function matchAmount(text: string): { amount: number; currency: string | null } | null {
  // Symbol-prefixed: ₦100,000 · $80 · ₵1,200.50 · ₦250k
  for (const m of text.matchAll(amountPattern(`([₦₵$€£])\\s?`, true))) {
    const amount = scale(m[2], m[3]);
    if (amount !== null && amount > 0) {
      return { amount, currency: CURRENCY_SYMBOLS[m[1]] ?? null };
    }
  }

  // Code-prefixed: NGN 100,000 · KES 5000
  for (const m of text.matchAll(amountPattern(`\\b([A-Z]{3})\\s?`, false))) {
    const code = CURRENCY_WORDS[m[1].toLowerCase()];
    if (!code) continue;
    const amount = scale(m[2], m[3]);
    if (amount !== null && amount > 0) return { amount, currency: code };
  }

  // Suffixed: 100,000 naira · 80 bucks · 5k shillings · 40 thousand naira
  const suffixed = new RegExp(
    `\\b([\\d,]+(?:\\.\\d{1,2})?)\\s*(${SCALE_PATTERN})?\\s*([a-z]{3,10})\\b`,
    'gi',
  );
  for (const m of text.matchAll(suffixed)) {
    const code = CURRENCY_WORDS[m[3].toLowerCase()];
    if (!code) continue;
    const amount = scale(m[1], m[2]);
    if (amount !== null && amount > 0) return { amount, currency: code };
  }

  /*
   * A scaled number carrying no currency: "send 250k to Carlos".
   *
   * Still ahead of a bare number, because nobody writes a line item as "250k".
   * The scale word is itself the signal that this was meant as money.
   */
  const scaled = new RegExp(`\\b([\\d,]+(?:\\.\\d{1,2})?)\\s*(${SCALE_PATTERN})\\b`, 'gi');
  for (const m of text.matchAll(scaled)) {
    const amount = scale(m[1], m[2]);
    if (amount !== null && amount > 0) return { amount, currency: null };
  }

  // Bare number, currency unknown — the last resort, and the least trustworthy.
  for (const m of text.matchAll(/\b([\d,]+(?:\.\d{1,2})?)\b/g)) {
    const amount = scale(m[1]);
    // Reject things that are obviously not amounts (years, phone fragments).
    if (amount !== null && amount > 0 && !/^(19|20)\d{2}$/.test(m[1].replace(/,/g, ''))) {
      return { amount, currency: null };
    }
  }

  return null;
}

/**
 * A number with an optional scale on it, behind whatever marks the currency.
 *
 * Built rather than written out because the scale alternation is derived from
 * `SCALES`, and a pattern that lists `k|m` beside a table that also knows
 * "thousand" is a pattern that will drift away from the table it belongs to.
 */
function amountPattern(prefix: string, ignoreCase: boolean): RegExp {
  return new RegExp(
    `${prefix}([\\d,]+(?:\\.\\d{1,2})?)\\s*(${SCALE_PATTERN})?\\b`,
    ignoreCase ? 'gi' : 'g',
  );
}

/**
 * Multipliers, by how they are written.
 *
 * The words matter as much as the letters. People write "40 thousand naira"
 * far more often than "40k naira", and a parser that reads only the second
 * turns the first into forty.
 */
const SCALES: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  m: 1_000_000,
  mn: 1_000_000,
  million: 1_000_000,
  bn: 1_000_000_000,
  billion: 1_000_000_000,
};

const SCALE_PATTERN = Object.keys(SCALES).sort((a, b) => b.length - a.length).join('|');

function scale(raw: string, suffix?: string): number | null {
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  if (!suffix) return n;
  return n * (SCALES[suffix.toLowerCase()] ?? 1);
}

function matchRecipient(text: string): string | null {
  // "to Carlos", "pay Carlos", "owe Carlos", "send Maria"
  const patterns = [
    /\bto\s+([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?)/u,
    /\b(?:pay|paying|owe|send|sending)\s+([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?)/u,
  ];

  const stop = new Set([
    'Bolivia', 'Nigeria', 'Kenya', 'Ghana', 'Uganda', 'Brazil', 'Colombia',
    'Mexico', 'South', 'Naira', 'Today', 'Tomorrow', 'Friday', 'Monday',
    'Tuesday', 'Wednesday', 'Thursday', 'Saturday', 'Sunday',
  ]);

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim();
      if (!stop.has(name.split(/\s+/)[0])) return name;
    }
  }
  return null;
}

function matchTiming(lower: string): {
  timing: 'now' | 'scheduled';
  scheduledFor: string | null;
  note: string | null;
} {
  const now = new Date();

  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    const at = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (at) {
      let hour = Number(at[1]) % 12;
      if (at[3] === 'pm') hour += 12;
      d.setHours(hour, at[2] ? Number(at[2]) : 0, 0, 0);
    } else {
      d.setHours(9, 0, 0, 0);
    }
    return {
      timing: 'scheduled',
      scheduledFor: d.toISOString(),
      note: at ? null : 'No time given for "tomorrow" — defaulted to 09:00.',
    };
  }

  const weekday = lower.match(
    /\b(?:on\s+|next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (weekday) {
    const target = [
      'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
    ].indexOf(weekday[1]);
    const d = new Date(now);
    const delta = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + delta);
    d.setHours(9, 0, 0, 0);
    return {
      timing: 'scheduled',
      scheduledFor: d.toISOString(),
      note: `Interpreted "${weekday[1]}" as the next one — ${d.toDateString()}.`,
    };
  }

  if (/\bnext week\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    return { timing: 'scheduled', scheduledFor: d.toISOString(), note: null };
  }

  return { timing: 'now', scheduledFor: null, note: null };
}
