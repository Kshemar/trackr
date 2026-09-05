import { prisma } from "./prisma";
import { DISPLAY_CURRENCIES, type DisplayCurrency, type SeriesStatus } from "./types";

const FX_TTL_MS = 60 * 60 * 1000;
const FRANKFURTER_QUOTES = DISPLAY_CURRENCIES.join(",");

export function parseDisplayCurrency(raw: string | null): DisplayCurrency {
  const value = (raw ?? "INR").toUpperCase();
  return (DISPLAY_CURRENCIES as readonly string[]).includes(value)
    ? (value as DisplayCurrency)
    : "INR";
}

export async function getUsdRate(ccy: DisplayCurrency): Promise<{
  rate: number | null;
  asOf: Date | null;
  status: SeriesStatus;
}> {
  if (ccy === ("USD" as DisplayCurrency)) {
    return { rate: 1, asOf: new Date(), status: "fresh" };
  }

  const cached = await prisma.fxCache.findUnique({ where: { quote: ccy } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < FX_TTL_MS) {
    return { rate: cached.rate, asOf: cached.asOf, status: "fresh" };
  }

  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(FRANKFURTER_QUOTES)}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        date?: string;
        rates?: Record<string, number>;
      };
      const asOf = json.date ? new Date(`${json.date}T00:00:00Z`) : new Date();
      const rates = json.rates ?? {};
      const writes = Object.entries(rates).map(([quote, rate]) =>
        prisma.fxCache.upsert({
          where: { quote },
          create: { quote, rate, asOf, fetchedAt: new Date() },
          update: { rate, asOf, fetchedAt: new Date() },
        }),
      );
      await Promise.all(writes);
      const rate = rates[ccy];
      if (typeof rate === "number") {
        return { rate, asOf, status: "fresh" };
      }
    }
  } catch {
    // stale below
  }

  if (cached) {
    return { rate: cached.rate, asOf: cached.asOf, status: "stale" };
  }
  return { rate: null, asOf: null, status: "unavailable" };
}
