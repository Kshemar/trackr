export const SPY = "SPY";
export const MAX_WATCHLIST = 50;

export const ATTENTION_PRICE_PCT = 2;
export const ATTENTION_EXCESS_PCT = 1.5;
export const ATTENTION_VOLUME_RATIO = 1.5;

export type QuoteStatus = "fresh" | "stale" | "unavailable";

export type SymbolHit = { symbol: string; description: string; displaySymbol?: string };

export type Quote = {
  symbol: string;
  price: number;
  prevClose: number;
  volume: number;
  avgVolume: number | null;
  exchange: string | null;
  asOf: Date;
  fetchedAt: Date;
  source: string;
  status: QuoteStatus;
};

export type AttentionRow = {
  symbol: string;
  price: number;
  prevClose: number;
  sessionChangePct: number;
  changeSinceSeenPct: number | null;
  excessVsSpyPct: number | null;
  volumeRatio: number | null;
  score: number;
  reasons: string[];
  quoteStatus: QuoteStatus;
  quoteAsOf: string;
  seenAt: string | null;
  needsAttention: boolean;
};

export type AttentionPayload = {
  asOf: string;
  marketSession: "open" | "closed" | "pre" | "after";
  dataSource: string;
  baselineOnly: boolean;
  attention: AttentionRow[];
  quiet: AttentionRow[];
  unavailable: AttentionRow[];
};

export function normalizeSymbol(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
}

export function pctChange(from: number, to: number) {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

export function formatPct(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatPrice(value: number) {
  return formatMoney(value, "USD");
}

export function formatMoney(value: number, currency: string) {
  try {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export const CHART_RANGES = ["1d", "1w", "1m", "3m", "1y"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export const DISPLAY_CURRENCIES = [
  "INR",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "SGD",
  "AED",
  "CHF",
  "MXN",
  "BRL",
  "KRW",
  "HKD",
  "NZD",
  "SEK",
] as const;

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export type SeriesPoint = { t: number; close: number };

export type SeriesStatus = "fresh" | "stale" | "unavailable";

export type PeerQuote = {
  symbol: string;
  price: number;
  sessionChangePct: number;
  quoteStatus: QuoteStatus;
};

export type SymbolDetail = {
  symbol: string;
  quote: {
    price: number;
    prevClose: number;
    sessionChangePct: number;
    quoteStatus: QuoteStatus;
    quoteAsOf: string;
    source: string;
    exchange: string | null;
  } | null;
  series: {
    range: ChartRange;
    points: SeriesPoint[];
    status: SeriesStatus;
    source: string;
  };
  fx: {
    ccy: string;
    usdToCcy: number | null;
    asOf: string | null;
    status: SeriesStatus;
  };
  display: {
    usd: number | null;
    local: number | null;
    ccy: string;
  };
  peers: PeerQuote[];
};
