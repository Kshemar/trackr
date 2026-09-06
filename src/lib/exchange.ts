import { normalizeSymbol } from "./types";

const SUFFIX: Record<string, string> = {
  DE: "Xetra",
  F: "Frankfurt",
  L: "LSE",
  T: "Tokyo",
  NS: "NSE",
  BO: "BSE",
  TO: "TSX",
  AX: "ASX",
  PA: "Euronext Paris",
  SW: "SIX",
  HK: "HKEX",
  MX: "BMV",
  SI: "SGX",
};

const VENUE_RULES: Array<[RegExp, string]> = [
  [/NASDAQ|NMS|NGM|NCM|NASDAQGS|NASDAQGM|NASDAQCM/, "NASDAQ"],
  [/NYSE\s*ARCA|ARCA/, "NYSE Arca"],
  [/NYSE\s*MKT|AMEX|AMERICAN STOCK/, "AMEX"],
  [/NEW YORK|NYSE|NYQ/, "NYSE"],
  [/TORONTO|TSX|^TOR$/, "TSX"],
  [/LONDON|LSE|^LSE$/, "LSE"],
  [/XETRA|^GER$/, "Xetra"],
  [/FRANKFURT|^FRA$/, "Frankfurt"],
  [/TOKYO|JPX|^TSE$/, "Tokyo"],
  [/NATIONAL STOCK EXCHANGE OF INDIA|^NSE$/, "NSE"],
  [/^BSE$|BOMBAY|BSE INDIA/, "BSE"],
  [/HONG KONG|HKEX|^HKG$/, "HKEX"],
  [/SWISS|SIX/, "SIX"],
  [/EURONEXT PARIS|^PAR$/, "Euronext Paris"],
  [/AUSTRALIAN|ASX/, "ASX"],
  [/SINGAPORE|SGX/, "SGX"],
];

export function normalizeVenue(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const compact = trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  for (const [pattern, label] of VENUE_RULES) {
    if (pattern.test(compact)) return label;
  }
  return trimmed;
}

export function inferExchange(symbol: string, hint?: string | null) {
  if (hint?.trim()) return normalizeVenue(hint);
  const parts = normalizeSymbol(symbol).split(".");
  if (parts.length < 2) return "US";
  const suf = parts.slice(1).join(".");
  return SUFFIX[suf] ?? suf;
}
