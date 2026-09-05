import { NextResponse } from "next/server";
import { requireAuthedRateLimit } from "@/lib/api-guard";
import { getSymbolDetail } from "@/lib/detail";
import { parseChartRange } from "@/lib/series";
import { parseDisplayCurrency } from "@/lib/fx";
import { normalizeSymbol } from "@/lib/types";

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> },
) {
  const gated = await requireAuthedRateLimit();
  if (gated.error) return gated.error;

  const { symbol: raw } = await context.params;
  const symbol = normalizeSymbol(raw);
  if (!symbol) return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });

  const url = new URL(request.url);
  const range = parseChartRange(url.searchParams.get("range"));
  const ccy = parseDisplayCurrency(url.searchParams.get("ccy"));
  const detail = await getSymbolDetail(symbol, range, ccy);
  return NextResponse.json(detail);
}
