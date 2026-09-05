import { prisma } from "./prisma";
import { getQuotes } from "./quotes";
import { getMarketSession } from "./market";
import {
  ATTENTION_EXCESS_PCT,
  ATTENTION_PRICE_PCT,
  ATTENTION_VOLUME_RATIO,
  MAX_WATCHLIST,
  SPY,
  normalizeSymbol,
  pctChange,
  type AttentionPayload,
  type AttentionRow,
} from "./types";

function scoreRow(input: {
  changeSinceSeenPct: number | null;
  excessVsSpyPct: number | null;
  volumeRatio: number | null;
}) {
  const px = Math.abs(input.changeSinceSeenPct ?? 0);
  const excess = Math.abs(input.excessVsSpyPct ?? 0);
  const vol = Math.max(0, (input.volumeRatio ?? 1) - 1);
  return 3 * px + 2 * excess + 1 * vol * 10;
}

function isAttention(input: {
  changeSinceSeenPct: number | null;
  excessVsSpyPct: number | null;
  volumeRatio: number | null;
}) {
  const px = Math.abs(input.changeSinceSeenPct ?? 0);
  const excess = Math.abs(input.excessVsSpyPct ?? 0);
  const vol = input.volumeRatio ?? 0;
  return px >= ATTENTION_PRICE_PCT || excess >= ATTENTION_EXCESS_PCT || vol >= ATTENTION_VOLUME_RATIO;
}

function reasonsFor(input: {
  changeSinceSeenPct: number | null;
  excessVsSpyPct: number | null;
  volumeRatio: number | null;
  baselineOnly: boolean;
}) {
  const reasons: string[] = [];
  if (input.baselineOnly) {
    reasons.push("Baseline captured — next visit will show what changed since you looked");
    return reasons;
  }
  if (input.changeSinceSeenPct !== null && Math.abs(input.changeSinceSeenPct) >= ATTENTION_PRICE_PCT) {
    const dir = input.changeSinceSeenPct >= 0 ? "up" : "down";
    reasons.push(`${Math.abs(input.changeSinceSeenPct).toFixed(1)}% ${dir} since you last looked`);
  }
  if (input.excessVsSpyPct !== null && Math.abs(input.excessVsSpyPct) >= ATTENTION_EXCESS_PCT) {
    const vs = input.excessVsSpyPct >= 0 ? "ahead of" : "behind";
    reasons.push(`${Math.abs(input.excessVsSpyPct).toFixed(1)}% ${vs} SPY over the same window`);
  }
  if (input.volumeRatio !== null && input.volumeRatio >= ATTENTION_VOLUME_RATIO) {
    reasons.push(`Volume ${input.volumeRatio.toFixed(1)}× usual`);
  }
  if (reasons.length === 0) {
    reasons.push("Quiet since last check");
  }
  return reasons;
}

export async function listWatchlist(userId: string) {
  return prisma.watchlistItem.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { addedAt: "asc" }],
  });
}

export async function addSymbol(userId: string, rawSymbol: string) {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) return { error: "Enter a ticker symbol." as const };

  const count = await prisma.watchlistItem.count({ where: { userId } });
  if (count >= MAX_WATCHLIST) {
    return { error: `Watchlist is capped at ${MAX_WATCHLIST} symbols.` as const };
  }

  const existing = await prisma.watchlistItem.findUnique({
    where: { userId_symbol: { userId, symbol } },
  });
  if (existing) return { error: `${symbol} is already on your list.` as const };

  await prisma.watchlistItem.create({
    data: { userId, symbol, sortOrder: count },
  });
  return { symbol };
}

export async function removeSymbol(userId: string, rawSymbol: string) {
  const symbol = normalizeSymbol(rawSymbol);
  await prisma.watchlistItem.deleteMany({ where: { userId, symbol } });
  await prisma.lastSeenSnapshot.deleteMany({ where: { userId, symbol } });
  return { symbol };
}

export async function getAttention(userId: string): Promise<AttentionPayload> {
  const items = await listWatchlist(userId);
  const symbols = items.map((item) => item.symbol);
  const quotes = await getQuotes([...symbols, SPY]);
  const spy = quotes.get(SPY);
  const snapshots = await prisma.lastSeenSnapshot.findMany({ where: { userId } });
  const snapBySymbol = new Map(snapshots.map((row) => [row.symbol, row]));

  const rows: AttentionRow[] = [];
  let anySnapshot = false;

  for (const item of items) {
    const quote = quotes.get(item.symbol);
    if (!quote) {
      rows.push({
        symbol: item.symbol,
        price: 0,
        prevClose: 0,
        sessionChangePct: 0,
        changeSinceSeenPct: null,
        excessVsSpyPct: null,
        volumeRatio: null,
        score: 0,
        reasons: ["Quote unavailable — vendor miss or unknown ticker"],
        quoteStatus: "unavailable",
        quoteAsOf: new Date().toISOString(),
        seenAt: snapBySymbol.get(item.symbol)?.seenAt.toISOString() ?? null,
        needsAttention: false,
      });
      continue;
    }

    const snap = snapBySymbol.get(item.symbol);
    const volumeRatio =
      quote.avgVolume && quote.avgVolume > 0 ? quote.volume / quote.avgVolume : null;
    const sessionChangePct = pctChange(quote.prevClose, quote.price);

    let changeSinceSeenPct: number | null = null;
    let excessVsSpyPct: number | null = null;
    let baselineOnly = false;

    if (!snap) {
      baselineOnly = true;
      if (spy) {
        await prisma.lastSeenSnapshot.create({
          data: {
            userId,
            symbol: item.symbol,
            price: quote.price,
            spyPrice: spy.price,
            volume: quote.volume,
            asOf: quote.asOf,
            seenAt: new Date(),
          },
        }).catch(() => undefined);
      }
    } else {
      anySnapshot = true;
      changeSinceSeenPct = pctChange(snap.price, quote.price);
      if (spy) {
        const spyMove = pctChange(snap.spyPrice, spy.price);
        excessVsSpyPct = changeSinceSeenPct - spyMove;
      }
    }

    const needs = !baselineOnly && isAttention({ changeSinceSeenPct, excessVsSpyPct, volumeRatio });
    rows.push({
      symbol: item.symbol,
      price: quote.price,
      prevClose: quote.prevClose,
      sessionChangePct,
      changeSinceSeenPct,
      excessVsSpyPct,
      volumeRatio,
      score: baselineOnly ? 0 : scoreRow({ changeSinceSeenPct, excessVsSpyPct, volumeRatio }),
      reasons: reasonsFor({ changeSinceSeenPct, excessVsSpyPct, volumeRatio, baselineOnly }),
      quoteStatus: quote.status,
      quoteAsOf: quote.asOf.toISOString(),
      seenAt: snap?.seenAt.toISOString() ?? new Date().toISOString(),
      needsAttention: needs,
    });
  }

  const unavailable = rows.filter((row) => row.quoteStatus === "unavailable");
  const live = rows.filter((row) => row.quoteStatus !== "unavailable");
  const attention = live
    .filter((row) => row.needsAttention)
    .sort((a, b) => b.score - a.score);
  const quiet = live
    .filter((row) => !row.needsAttention)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const sources = [...quotes.values()].map((q) => q.source);
  const dataSource = sources.includes("finnhub") ? "finnhub" : sources[0] ?? "none";

  return {
    asOf: new Date().toISOString(),
    marketSession: getMarketSession(),
    dataSource,
    baselineOnly: snapshots.length === 0 && !anySnapshot,
    attention,
    quiet,
    unavailable,
  };
}

export async function acknowledge(userId: string, symbols?: string[]) {
  const items = await listWatchlist(userId);
  const target = symbols?.length
    ? items.filter((item) => symbols.map(normalizeSymbol).includes(item.symbol))
    : items;
  const quotes = await getQuotes([...target.map((item) => item.symbol), SPY]);
  const spy = quotes.get(SPY);
  const now = new Date();

  for (const item of target) {
    const quote = quotes.get(item.symbol);
    if (!quote || !spy) continue;
    await prisma.lastSeenSnapshot.upsert({
      where: { userId_symbol: { userId, symbol: item.symbol } },
      create: {
        userId,
        symbol: item.symbol,
        price: quote.price,
        spyPrice: spy.price,
        volume: quote.volume,
        asOf: quote.asOf,
        seenAt: now,
      },
      update: {
        price: quote.price,
        spyPrice: spy.price,
        volume: quote.volume,
        asOf: quote.asOf,
        seenAt: now,
      },
    });
  }
}
