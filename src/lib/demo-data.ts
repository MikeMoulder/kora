/**
 * The people, places and rates the dashboard is a dashboard *of*.
 *
 * Invented, and labelled as such wherever it is shown. The corridor engine
 * behind it stays real; this is the cast it operates on.
 *
 * What used to sit here as well was a fixed list of transactions and a fixed
 * array of weekly spend. Those are gone. Activity is now derived in
 * `lib/account/activity.ts` from an opening history plus the real ledger, so
 * a payment that goes out through the corridor actually shows up in the rows
 * and actually moves the chart. Two hardcoded arrays could never do that, and
 * worse, they could never be wrong in a way anybody would notice.
 *
 * Everything that remains here is a fixed literal rather than generated at
 * runtime, for the usual reason: values that differ between the server render
 * and the client hydration are reported by React as a mismatch.
 */

/**
 * Where an inbound naira payment would land.
 *
 * Shaped like a real NIP destination, which is three fields and nothing else:
 * a payer needs the bank, the ten digit NUBAN and the name to check it against
 * before they confirm. The number is in the 0112xxxxxx demo range and belongs
 * to nobody.
 */
export interface DemoReceivingAccount {
  bankName: string;
  /** NUBAN, ten digits. */
  accountNumber: string;
  accountName: string;
  rail: string;
}

export interface DemoAccount {
  firstName: string;
  fullName: string;
  currency: 'NGN';
  /** Major units. */
  balance: number;
  country: string;
  /** Which file in `public/avatars` carries this person's portrait. */
  avatarId: string;
  receiving: DemoReceivingAccount;
}

export const ACCOUNT: DemoAccount = {
  firstName: 'Ada',
  fullName: 'Adaeze Okafor',
  currency: 'NGN',
  balance: 4_820_650.0,
  country: 'NG',
  avatarId: 'ada-okafor',
  receiving: {
    bankName: 'Sterling Bank',
    accountNumber: '0112436789',
    accountName: 'Adaeze Okafor',
    rail: 'NIP instant transfer',
  },
};

// ── Beneficiaries ─────────────────────────────────────────────────────────

export interface Beneficiary {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2 of where they collect the money. */
  country: string;
  countryName: string;
  /** What they do, shown as the second line. */
  role: string;
  /** Local currency they are paid out in. */
  payoutCurrency: string;
  /** Masked destination detail, the shape a real payout record would carry. */
  account: string;
  /** How many payments have gone out to them. */
  paymentCount: number;
  lastPaidAt: string | null;
  favourite: boolean;
  /** Which file in `public/avatars` carries their portrait. */
  avatarId: string;
  /**
   * Low and high of what one invoice from them runs to, in NGN.
   *
   * The opening history draws inside this band rather than from one flat
   * range for everybody. A designer's invoice and a QA pass being the same
   * size is the detail that makes generated data read as generated.
   */
  rateBand: [number, number];
}

/**
 * Bolivian, because that is the leg Pollar settles. A KORA beneficiary list is
 * the Latin American side of the corridor by definition: the African side is
 * where the money comes from, not where it lands.
 */
export const BENEFICIARIES: Beneficiary[] = [
  {
    id: 'ben_carlos',
    name: 'Carlos Mamani',
    country: 'BO',
    countryName: 'Bolivia',
    role: 'Product designer',
    payoutCurrency: 'BOB',
    account: 'Banco Union ****4471',
    paymentCount: 14,
    lastPaidAt: '2026-09-11T09:20:00Z',
    favourite: true,
      avatarId: 'carlos-mamani',
    rateBand: [280_000, 520_000],
  },
  {
    id: 'ben_maria',
    name: 'Maria Quispe',
    country: 'BO',
    countryName: 'Bolivia',
    role: 'Front-end contractor',
    payoutCurrency: 'BOB',
    account: 'Banco Mercantil ****9032',
    paymentCount: 9,
    lastPaidAt: '2026-09-05T14:05:00Z',
    favourite: true,
      avatarId: 'maria-quispe',
    rateBand: [180_000, 340_000],
  },
  {
    id: 'ben_diego',
    name: 'Diego Rojas',
    country: 'BO',
    countryName: 'Bolivia',
    role: 'Motion and video',
    payoutCurrency: 'BOB',
    account: 'Banco BISA ****2218',
    paymentCount: 4,
    lastPaidAt: '2026-08-28T11:40:00Z',
    favourite: false,
      avatarId: 'diego-rojas',
    rateBand: [95_000, 210_000],
  },
  {
    id: 'ben_valeria',
    name: 'Valeria Ticona',
    country: 'BO',
    countryName: 'Bolivia',
    role: 'QA and support',
    payoutCurrency: 'BOB',
    account: 'Banco Union ****7765',
    paymentCount: 2,
    lastPaidAt: '2026-08-14T08:15:00Z',
    favourite: false,
      avatarId: 'valeria-ticona',
    rateBand: [60_000, 130_000],
  },
  {
    id: 'ben_ana',
    name: 'Ana Flores',
    country: 'CO',
    countryName: 'Colombia',
    role: 'Copywriter',
    payoutCurrency: 'COP',
    account: 'Bancolombia ****1190',
    paymentCount: 1,
    lastPaidAt: null,
    favourite: false,
      avatarId: 'ana-flores',
    rateBand: [45_000, 110_000],
  },
  {
    id: 'ben_bruno',
    name: 'Bruno Almeida',
    country: 'BR',
    countryName: 'Brazil',
    role: 'Backend contractor',
    payoutCurrency: 'BRL',
    account: 'Pix key ****@almeida.dev',
    paymentCount: 0,
    lastPaidAt: null,
    favourite: false,
      avatarId: 'bruno-almeida',
    rateBand: [220_000, 430_000],
  },
];

// ── Income ────────────────────────────────────────────────────────

/**
 * Where the naira comes from before it goes out again.
 *
 * Businesses rather than people, because that is what pays an agency: a
 * client retainer, a settled invoice, a collections payout. The distinction
 * is not cosmetic. It is what decides whether a row draws a portrait or a
 * logo, and it is the axis the transaction list is sorted along by eye.
 */
export interface IncomeSource {
  name: string;
  /** What the money was for. */
  detail: string;
  /** Low and high of one payment, in NGN. */
  rateBand: [number, number];
  /** Which file in `public/avatars` carries their logo, when one exists. */
  avatarId: string | null;
}

export const INCOME_SOURCES: IncomeSource[] = [
  {
    name: 'Lagos Ventures Ltd',
    detail: 'Client retainer',
    rateBand: [900_000, 1_600_000],
    avatarId: null,
  },
  {
    name: 'Kuda Business',
    detail: 'Invoice settled',
    rateBand: [220_000, 480_000],
    avatarId: null,
  },
  {
    name: 'Paystack',
    detail: 'Collections payout',
    rateBand: [380_000, 920_000],
    avatarId: null,
  },
  {
    name: 'Flutterwave',
    detail: 'Merchant settlement',
    rateBand: [260_000, 700_000],
    avatarId: null,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

/** Initials for a monogram. Two letters at most. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function formatNaira(amount: number, options?: { signed?: boolean }): string {
  const sign = options?.signed ? (amount > 0 ? '+' : amount < 0 ? '−' : '') : '';
  const body = Math.abs(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}₦${body}`;
}

export function relativeDay(iso: string): string {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
