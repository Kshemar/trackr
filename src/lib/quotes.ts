import { prisma } from "./prisma";
import { getMarketSession, quoteTtlMs } from "./market";
import { consumeFinnhub, peekFinnhub } from "./rate-limit";
import type { Quote, QuoteStatus, SymbolHit } from "./types";
import { normalizeSymbol } from "./types";
import { inferExchange } from "./exchange";

type FetchedQuote = Omit<Quote, "status" | "fetchedAt"> & { raw: unknown };

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function finnhubQuote(symbol: string, token: string): Promise<FetchedQuote | null> {
  const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
  const candleTo = Math.floor(Date.now() / 1000);
  const candleFrom = candleTo - 60 * 60 * 24 * 40;
  const candleUrl = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${candleFrom}&to=${candleTo}&token=${token}`;

  const [quoteRes, candleRes] = await Promise.all([
    fetch(quoteUrl, { cache: "no-store" }),
    fetch(candleUrl, { cache: "no-store" }),
  ]);

  if (quoteRes.status === 429) throw new Error("RATE_LIMIT");
  if (!quoteRes.ok) return null;

  const quote = (await quoteRes.json()) as {
    c?: number;
    pc?: number;
    t?: number;
    error?: string;
  };
  if (!quote.c || quote.c === 0) return null;

  let volume = 0;
  let avgVolume: number | null = null;
  if (candleRes.ok) {
    const candle = (await candleRes.json()) as { s?: string; v?: number[] };
    if (candle.s === "ok" && candle.v?.length) {
      volume = candle.v[candle.v.length - 1] ?? 0;
      const window = candle.v.slice(-20);
      avgVolume = window.reduce((a, b) => a + b, 0) / window.length;
    }
  }

  let exchangeHint: string | null = null;
  if (await consumeFinnhub(1)) {
    try {
      const profileRes = await fetch(
        `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`,
        { cache: "no-store" },
      );
      if (profileRes.ok) {
        const profile = (await profileRes.json()) as { exchange?: string };
        exchangeHint = profile.exchange?.trim() || null;
      }
    } catch {
      // Suffix map / "US" is enough when profile2 is skipped.
    }
  }

  return {
    symbol,
    price: quote.c,
    prevClose: quote.pc || quote.c,
    volume,
    avgVolume,
    exchange: inferExchange(symbol, exchangeHint),
    asOf: quote.t ? new Date(quote.t * 1000) : new Date(),
    source: "finnhub",
    raw: quote,
  };
}

async function yahooQuote(symbol: string): Promise<FetchedQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "smart-watchlist/0.1" },
  });
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) return null;

  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          chartPreviousClose?: number;
          regularMarketTime?: number;
          previousClose?: number;
          fullExchangeName?: string;
          exchangeName?: string;
        };
        timestamp?: number[];
        indicators?: { quote?: Array<{ volume?: Array<number | null> }> };
      }>;
    };
  };

  const result = json.chart?.result?.[0];
  const price = result?.meta?.regularMarketPrice;
  if (!price) return null;
  const volumes = (result?.indicators?.quote?.[0]?.volume ?? []).filter((v): v is number => typeof v === "number");
  const volume = volumes.at(-1) ?? 0;
  const window = volumes.slice(-20);
  const avgVolume = window.length ? window.reduce((a, b) => a + b, 0) / window.length : null;
  const asOfUnix = result?.meta?.regularMarketTime;
  const prevClose = result?.meta?.chartPreviousClose || result?.meta?.previousClose || price;

  return {
    symbol,
    price,
    prevClose,
    volume,
    avgVolume,
    exchange: inferExchange(
      symbol,
      result?.meta?.fullExchangeName || result?.meta?.exchangeName,
    ),
    asOf: asOfUnix ? new Date(asOfUnix * 1000) : new Date(),
    source: "yahoo",
    raw: result?.meta ?? {},
  };
}

async function fetchLiveQuote(symbol: string): Promise<FetchedQuote | null> {
  const token = process.env.FINNHUB_API_KEY?.trim();
  if (token && (await consumeFinnhub(2))) {
    try {
      const fromFinnhub = await finnhubQuote(symbol, token);
      if (fromFinnhub) return fromFinnhub;
    } catch {
      // Rate limit or vendor error: try Yahoo rather than failing closed.
    }
  }
  return yahooQuote(symbol);
}

function toQuote(
  row: {
    symbol: string;
    price: number;
    prevClose: number;
    volume: number;
    avgVolume: number | null;
    exchange: string | null;
    asOf: Date;
    fetchedAt: Date;
    source: string;
  },
  status: QuoteStatus,
): Quote {
  return {
    symbol: row.symbol,
    price: row.price,
    prevClose: row.prevClose,
    volume: row.volume,
    avgVolume: row.avgVolume,
    exchange: inferExchange(row.symbol, row.exchange),
    asOf: row.asOf,
    fetchedAt: row.fetchedAt,
    source: row.source,
    status,
  };
}

export async function getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const unique = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  const session = getMarketSession();
  const ttl = quoteTtlMs(session);
  const now = Date.now();
  const result = new Map<string, Quote>();

  const cached = await prisma.quoteCache.findMany({
    where: { symbol: { in: unique } },
  });
  const cachedBySymbol = new Map(cached.map((row) => [row.symbol, row]));

  const staleOrMissing: string[] = [];
  for (const symbol of unique) {
    const row = cachedBySymbol.get(symbol);
    if (row && now - row.fetchedAt.getTime() < ttl) {
      result.set(symbol, toQuote(row, "fresh"));
    } else {
      staleOrMissing.push(symbol);
    }
  }

  try {
    await mapLimit(staleOrMissing, 5, async (symbol) => {
      try {
        const old = cachedBySymbol.get(symbol);
        if (old && !(await peekFinnhub(2))) {
          result.set(symbol, toQuote(old, "stale"));
          return;
        }
        const live = await fetchLiveQuote(symbol);
        if (!live) {
          const old = cachedBySymbol.get(symbol);
          if (old) result.set(symbol, toQuote(old, "stale"));
          return;
        }
        const saved = await prisma.quoteCache.upsert({
          where: { symbol },
          create: {
            symbol,
            price: live.price,
            prevClose: live.prevClose,
            volume: live.volume,
            avgVolume: live.avgVolume,
            exchange: live.exchange,
            asOf: live.asOf,
            fetchedAt: new Date(),
            source: live.source,
            rawJson: JSON.stringify(live.raw),
          },
          update: {
            price: live.price,
            prevClose: live.prevClose,
            volume: live.volume,
            avgVolume: live.avgVolume,
            exchange: live.exchange,
            asOf: live.asOf,
            fetchedAt: new Date(),
            source: live.source,
            rawJson: JSON.stringify(live.raw),
          },
        });
        result.set(symbol, toQuote(saved, "fresh"));
      } catch (err) {
        const old = cachedBySymbol.get(symbol);
        if (old) result.set(symbol, toQuote(old, "stale"));
        if ((err as Error).message === "RATE_LIMIT") {
          throw err;
        }
      }
    });
  } catch {
    for (const symbol of staleOrMissing) {
      if (result.has(symbol)) continue;
      const old = cachedBySymbol.get(symbol);
      if (old) result.set(symbol, toQuote(old, "stale"));
    }
  }

  return result;
}

export async function searchSymbols(query: string): Promise<SymbolHit[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  const token = process.env.FINNHUB_API_KEY?.trim();
  if (token && (await consumeFinnhub(1))) {
    const res = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${token}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        result?: Array<{
          symbol?: string;
          displaySymbol?: string;
          description?: string;
          type?: string;
        }>;
      };
      return (json.result ?? [])
        .filter((row) => row.symbol && (row.type === "Common Stock" || row.type === "ETP" || !row.type))
        .slice(0, 8)
        .map((row) => ({
          symbol: normalizeSymbol(row.symbol!),
          displaySymbol: row.displaySymbol,
          description: row.description ?? "",
        }));
    }
  }

  const res = await fetch(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
    { cache: "no-store", headers: { "User-Agent": "smart-watchlist/0.1" } },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    quotes?: Array<{
      symbol?: string;
      shortname?: string;
      quoteType?: string;
      exchDisp?: string;
    }>;
  };
  return (json.quotes ?? [])
    .filter((row) => row.symbol && (row.quoteType === "EQUITY" || row.quoteType === "ETF"))
    .slice(0, 8)
    .map((row) => ({
      symbol: normalizeSymbol(row.symbol!),
      displaySymbol: row.symbol,
      description: [row.shortname, row.exchDisp].filter(Boolean).join(" · "),
    }));
}
