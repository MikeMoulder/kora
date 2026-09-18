/**
 * Demo account data for the dashboard.
 *
 * Invented, and labelled as such wherever it is shown. It exists so the
 * dashboard has something to be a dashboard *of* while the corridor engine
 * behind it stays real. Nothing here is fetched, nothing is persisted, and no
 * figure on this page should be read as a live balance.
 *
 * Everything is a fixed literal rather than generated at runtime. Random data
 * would differ between the server render and the client hydration, which React
 * reports as a mismatch, and a chart that reshuffles on every reload is worse
 * for a demo than one that does not.
 */

export interface DemoAccount {
  firstName: string;
  fullName: string;
  currency: 'NGN';
  /** Major units. */
  balance: number;
  /** Change over the period shown, major units. */
  delta: number;
  country: string;
}

export const ACCOUNT: DemoAccount = {
  firstName: 'Ada',
  fullName: 'Adaeze Okafor',
  currency: 'NGN',
  balance: 4_820_650.0,
  delta: 182_400.0,
  country: 'NG',
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
  },
];

// ── Transactions ──────────────────────────────────────────────────────────

export type TxDirection = 'out' | 'in';

export interface DemoTransaction {
  id: string;
  /** Counterparty. A person for payouts, a business for income. */
  party: string;
  kind: 'person' | 'business';
  direction: TxDirection;
  /** Signed amount in NGN, major units. */
  amount: number;
  /** What actually happened, shown as the second line. */
  detail: string;
  at: string;
  /** Present when this went through a KORA corridor. */
  corridor?: string;
}

export const TRANSACTIONS: DemoTransaction[] = [
  {
    id: 'tx_01',
    party: 'Lagos Ventures Ltd',
    kind: 'business',
    direction: 'in',
    amount: 1_450_000,
    detail: 'Client retainer, September',
    at: '2026-09-17T16:42:00Z',
  },
  {
    id: 'tx_02',
    party: 'Carlos Mamani',
    kind: 'person',
    direction: 'out',
    amount: -412_300,
    detail: 'Logo and brand system',
    at: '2026-09-17T09:20:00Z',
    corridor: 'NG.NGN.NIP.onramp',
  },
  {
    id: 'tx_03',
    party: 'Maria Quispe',
    kind: 'person',
    direction: 'out',
    amount: -268_900,
    detail: 'Dashboard build, milestone 2',
    at: '2026-09-16T11:08:00Z',
    corridor: 'NG.NGN.NIP.onramp',
  },
  {
    id: 'tx_04',
    party: 'Kuda Business',
    kind: 'business',
    direction: 'in',
    amount: 320_000,
    detail: 'Invoice 2026-114 settled',
    at: '2026-09-15T13:55:00Z',
  },
  {
    id: 'tx_05',
    party: 'Diego Rojas',
    kind: 'person',
    direction: 'out',
    amount: -154_750,
    detail: 'Launch film, first cut',
    at: '2026-09-14T15:30:00Z',
    corridor: 'NG.NGN.NIP.onramp',
  },
  {
    id: 'tx_06',
    party: 'Valeria Ticona',
    kind: 'person',
    direction: 'out',
    amount: -96_400,
    detail: 'Regression pass, sprint 9',
    at: '2026-09-12T10:02:00Z',
    corridor: 'KE.KES.MPESA.onramp',
  },
  {
    id: 'tx_07',
    party: 'Paystack',
    kind: 'business',
    direction: 'in',
    amount: 688_200,
    detail: 'Collections payout',
    at: '2026-09-11T08:18:00Z',
  },
];

// ── Spend series ──────────────────────────────────────────────────────────

/**
 * Weekly outbound spend for the dot matrix, in NGN thousands.
 *
 * Fifty two fixed values. The peak is the week the chart calls out, which is
 * why the series is written down rather than generated: the callout has to
 * land on a known column.
 */
export const SPEND_WEEKS: number[] = [
  180, 220, 140, 310, 260, 190, 240, 420, 380, 300, 260, 340, 290, 210, 250, 330, 470, 520,
  390, 280, 240, 360, 310, 260, 420, 560, 610, 480, 350, 300, 270, 390, 440, 520, 680, 740,
  820, 610, 470, 380, 330, 420, 500, 580, 640, 720, 560, 430, 360, 410, 470, 520,
];

/** Index of the week the chart annotates. The tallest column. */
export const SPEND_PEAK_INDEX = 36;

/** Total across the series, in NGN. */
export const SPEND_TOTAL = SPEND_WEEKS.reduce((sum, week) => sum + week, 0) * 1_000;

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
