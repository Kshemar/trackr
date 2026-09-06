import { prisma } from "./prisma";
import { consumeFinnhub } from "./rate-limit";
import { getQuotes } from "./quotes";
import { normalizeSymbol, pctChange, type PeerQuote } from "./types";

const PEER_TTL_MS = 24 * 60 * 60 * 1000;
const PEER_CAP = 6;

async function finnhubPeers(symbol: string, token: string): Promise<string[] | null> {
  const res = await fetch(
    `https://finnhub.io/api/v1/stock/peers?symbol=${encodeURIComponent(symbol)}&token=${token}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) return null;
  return json
    .filter((row): row is string => typeof row === "string")
    .map(normalizeSymbol)
    .filter((row) => row && row !== symbol);
}

async function yahooPeers(symbol: string): Promise<string[] | null> {
  const url = `https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encodeURIComponent(symbol)}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "smart-watchlist/0.1" },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    finance?: {
      result?: Array<{
        recommendedSymbols?: Array<{ symbol?: string }>;
      }>;
    };
  };
  const recs = json.finance?.result?.[0]?.recommendedSymbols ?? [];
  const peers = recs
    .map((row) => normalizeSymbol(row.symbol ?? ""))
    .filter((row) => row && row !== symbol);
  return peers.length ? peers : null;
}

async function fetchPeerSymbols(symbol: string): Promise<{ peers: string[]; source: string } | null> {
  const token = process.env.FINNHUB_API_KEY?.trim();
  if (token && (await consumeFinnhub(1))) {
    try {
      const fromFinnhub = await finnhubPeers(symbol, token);
      if (fromFinnhub?.length) return { peers: fromFinnhub, source: "finnhub" };
    } catch {
      // fallback
    }
  }
  try {
    const fromYahoo = await yahooPeers(symbol);
    if (fromYahoo?.length) return { peers: fromYahoo, source: "yahoo" };
  } catch {
    return null;
  }
  return null;
}

export async function getPeers(symbolRaw: string, cap = PEER_CAP): Promise<PeerQuote[]> {
  const symbol = normalizeSymbol(symbolRaw);
  const limit = Math.min(cap, PEER_CAP);
  const cached = await prisma.peerCache.findUnique({ where: { symbol } });
  let names: string[] = [];

  if (cached && Date.now() - cached.fetchedAt.getTime() < PEER_TTL_MS) {
    names = JSON.parse(cached.peersJson) as string[];
  } else {
    const live = await fetchPeerSymbols(symbol);
    if (live) {
      names = live.peers.slice(0, PEER_CAP);
      await prisma.peerCache.upsert({
        where: { symbol },
        create: {
          symbol,
          peersJson: JSON.stringify(names),
          fetchedAt: new Date(),
          source: live.source,
        },
        update: {
          peersJson: JSON.stringify(names),
          fetchedAt: new Date(),
          source: live.source,
        },
      });
    } else if (cached) {
      names = JSON.parse(cached.peersJson) as string[];
    }
  }

  names = names.filter((name) => name !== symbol).slice(0, limit);
  if (!names.length) return [];

  const quotes = await getQuotes(names);
  return names.map((name) => {
    const quote = quotes.get(name);
    if (!quote) {
      return {
        symbol: name,
        price: 0,
        sessionChangePct: 0,
        quoteStatus: "unavailable" as const,
      };
    }
    return {
      symbol: name,
      price: quote.price,
      sessionChangePct: pctChange(quote.prevClose, quote.price),
      quoteStatus: quote.status,
    };
  });
}
