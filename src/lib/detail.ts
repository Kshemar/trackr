import { getQuotes } from "./quotes";
import { getSeries } from "./series";
import { getUsdRate } from "./fx";
import { getPeers } from "./peers";
import { normalizeSymbol, pctChange, type ChartRange, type DisplayCurrency, type PeerQuote, type SymbolDetail } from "./types";

function quotePayload(symbol: string, quotes: Awaited<ReturnType<typeof getQuotes>>): SymbolDetail["quote"] {
  const quote = quotes.get(symbol);
  if (!quote) return null;
  return {
    price: quote.price,
    prevClose: quote.prevClose,
    sessionChangePct: pctChange(quote.prevClose, quote.price),
    quoteStatus: quote.status,
    quoteAsOf: quote.asOf.toISOString(),
    source: quote.source,
  };
}

export async function getSymbolChart(symbolRaw: string, range: ChartRange) {
  const symbol = normalizeSymbol(symbolRaw);
  const [quotes, series] = await Promise.all([getQuotes([symbol]), getSeries(symbol, range)]);
  return {
    symbol,
    quote: quotePayload(symbol, quotes),
    series: {
      range,
      points: series.points,
      status: series.status,
      source: series.source,
    },
  };
}

export async function getSymbolPeers(symbolRaw: string): Promise<PeerQuote[]> {
  return getPeers(normalizeSymbol(symbolRaw));
}

export async function getSymbolDetail(
  symbolRaw: string,
  range: ChartRange,
  ccy: DisplayCurrency,
): Promise<SymbolDetail> {
  const symbol = normalizeSymbol(symbolRaw);
  const [chart, fx, peers] = await Promise.all([
    getSymbolChart(symbol, range),
    getUsdRate(ccy),
    getPeers(symbol),
  ]);
  const usd = chart.quote?.price ?? null;
  const local = usd !== null && fx.rate !== null ? usd * fx.rate : null;

  return {
    symbol,
    quote: chart.quote,
    series: chart.series,
    fx: {
      ccy,
      usdToCcy: fx.rate,
      asOf: fx.asOf?.toISOString() ?? null,
      status: fx.status,
    },
    display: {
      usd,
      local,
      ccy,
    },
    peers,
  };
}
