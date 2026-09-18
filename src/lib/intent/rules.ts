/**
 * Deterministic intent parser.
 *
 * Not a fallback bolted on late — it runs first, and the model is only asked
 * for what the rules could not resolve. Two reasons:
 *
 *   1. It cannot hallucinate an amount. For the one field where being
 *      confidently wrong costs the user money, a regex that either matches or
 *      does not is the safer instrument.
 *   2. The demo works with no API key, no network and no latency.
 *
 * The model earns its place on the things rules are bad at: loose phrasing,
 * relative dates, and purpose extraction.
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

function matchAmount(text: string): { amount: number; currency: string | null } | null {
  // Symbol-prefixed: ₦100,000 · $80 · ₵1,200.50
  const symbol = text.match(/([₦₵$€£])\s?([\d,]+(?:\.\d{1,2})?)\s*([km])?\b/i);
  if (symbol) {
    const amount = scale(symbol[2], symbol[3]);
    if (amount !== null) return { amount, currency: CURRENCY_SYMBOLS[symbol[1]] ?? null };
  }

  // Code-prefixed: NGN 100,000 · KES 5000
  const prefixed = text.match(/\b([A-Z]{3})\s?([\d,]+(?:\.\d{1,2})?)\s*([km])?\b/);
  if (prefixed && CURRENCY_WORDS[prefixed[1].toLowerCase()]) {
    const amount = scale(prefixed[2], prefixed[3]);
    if (amount !== null) return { amount, currency: CURRENCY_WORDS[prefixed[1].toLowerCase()] };
  }

  // Suffixed: 100,000 naira · 80 bucks · 5k shillings
  const suffixed = text.match(
    /\b([\d,]+(?:\.\d{1,2})?)\s*([km])?\s*([a-z]{3,10})\b/i,
  );
  if (suffixed) {
    const code = CURRENCY_WORDS[suffixed[3].toLowerCase()];
    if (code) {
      const amount = scale(suffixed[1], suffixed[2]);
      if (amount !== null) return { amount, currency: code };
    }
  }

  // Bare number, currency unknown — still worth capturing.
  const bare = text.match(/\b([\d,]+(?:\.\d{1,2})?)\s*([km])?\b/i);
  if (bare) {
    const amount = scale(bare[1], bare[2]);
    // Reject things that are obviously not amounts (years, phone fragments).
    if (amount !== null && amount > 0 && !/^(19|20)\d{2}$/.test(bare[1].replace(/,/g, ''))) {
      return { amount, currency: null };
    }
  }

  return null;
}

function scale(raw: string, suffix?: string): number | null {
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  if (!suffix) return n;
  return suffix.toLowerCase() === 'k' ? n * 1_000 : n * 1_000_000;
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
