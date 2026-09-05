import { prisma } from "./prisma";
import { getMarketSession, quoteTtlMs } from "./market";
import { consumeFinnhub, peekFinnhub } from "./rate-limit";
import {
  CHART_RANGES,
  normalizeSymbol,
  type ChartRange,
  type SeriesPoint,
  type SeriesStatus,
} from "./types";

const YAHOO_CHART: Record<ChartRange, { interval: string; range: string }> = {
  "1d": { interval: "5m", range: "1d" },
  "1w": { interval: "15m", range: "5d" },
  "1m": { interval: "1d", range: "1mo" },
  "3m": { interval: "1d", range: "3mo" },
  "1y": { interval: "1d", range: "1y" },
};

function finnhubWindow(range: ChartRange): { resolution: string; fromAgoSec: number } {
  const day = 60 * 60 * 24;
  if (range === "1d") return { resolution: "5", fromAgoSec: day + 60 * 60 };
  if (range === "1w") return { resolution: "60", fromAgoSec: day * 8 };
  if (range === "1m") return { resolution: "D", fromAgoSec: day * 35 };
  if (range === "3m") return { resolution: "D", fromAgoSec: day * 100 };
  return { resolution: "D", fromAgoSec: day * 400 };
}

function parseYahooPoints(json: unknown): SeriesPoint[] {
  const chart = json as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };
  const result = chart.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const points: SeriesPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (typeof close === "number" && Number.isFinite(close)) {
      points.push({ t: timestamps[i] * 1000, close });
    }
  }
  return points;
}

async function yahooSeries(symbol: string, range: ChartRange): Promise<{ points: SeriesPoint[]; source: string } | null> {
  const spec = YAHOO_CHART[range];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${spec.interval}&range=${spec.range}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "smart-watchlist/0.1" },
  });
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) return null;
  const points = parseYahooPoints(await res.json());
  if (!points.length) return null;
  return { points, source: "yahoo" };
}

async function finnhubSeries(symbol: string, range: ChartRange, token: string): Promise<{ points: SeriesPoint[]; source: string } | null> {
  const { resolution, fromAgoSec } = finnhubWindow(range);
  const to = Math.floor(Date.now() / 1000);
  const from = to - fromAgoSec;
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${token}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) return null;
  const json = (await res.json()) as { s?: string; t?: number[]; c?: number[] };
  if (json.s !== "ok" || !json.t?.length || !json.c?.length) return null;
  const points: SeriesPoint[] = [];
  for (let i = 0; i < json.t.length; i++) {
    const close = json.c[i];
    if (typeof close === "number") points.push({ t: json.t[i] * 1000, close });
  }
  return points.length ? { points, source: "finnhub" } : null;
}

async function fetchLiveSeries(symbol: string, range: ChartRange) {
  const token = process.env.FINNHUB_API_KEY?.trim();
  if (token && (await consumeFinnhub(1))) {
    try {
      const fromFinnhub = await finnhubSeries(symbol, range, token);
      if (fromFinnhub) return fromFinnhub;
    } catch {
      // fall through
    }
  }
  return yahooSeries(symbol, range);
}

function downsample(points: SeriesPoint[], max = 400) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: SeriesPoint[] = [];
  for (let i = 0; i < max; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

export function parseChartRange(raw: string | null): ChartRange {
  const value = (raw ?? "3m") as ChartRange;
  return CHART_RANGES.includes(value) ? value : "3m";
}

export async function getSeries(symbolRaw: string, range: ChartRange): Promise<{
  points: SeriesPoint[];
  status: SeriesStatus;
  source: string;
}> {
  const symbol = normalizeSymbol(symbolRaw);
  const ttl = quoteTtlMs(getMarketSession());
  const cached = await prisma.seriesCache.findUnique({
    where: { symbol_range: { symbol, range } },
  });

  if (cached && Date.now() - cached.fetchedAt.getTime() < ttl) {
    return {
      points: downsample(JSON.parse(cached.pointsJson) as SeriesPoint[]),
      status: "fresh",
      source: cached.source,
    };
  }

  if (cached && !(await peekFinnhub(1))) {
    return {
      points: downsample(JSON.parse(cached.pointsJson) as SeriesPoint[]),
      status: "stale",
      source: cached.source,
    };
  }

  try {
    const live = await fetchLiveSeries(symbol, range);
    if (live) {
      await prisma.seriesCache.upsert({
        where: { symbol_range: { symbol, range } },
        create: {
          symbol,
          range,
          pointsJson: JSON.stringify(live.points),
          fetchedAt: new Date(),
          source: live.source,
        },
        update: {
          pointsJson: JSON.stringify(live.points),
          fetchedAt: new Date(),
          source: live.source,
        },
      });
      return { points: downsample(live.points), status: "fresh", source: live.source };
    }
  } catch {
    // stale cache below
  }

  if (cached) {
    return {
      points: downsample(JSON.parse(cached.pointsJson) as SeriesPoint[]),
      status: "stale",
      source: cached.source,
    };
  }

  return { points: [], status: "unavailable", source: "none" };
}
