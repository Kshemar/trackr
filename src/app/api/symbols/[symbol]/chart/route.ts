import { NextResponse } from "next/server";
import { requireAuthedRateLimit } from "@/lib/api-guard";
import { getSymbolChart } from "@/lib/detail";
import { parseChartRange } from "@/lib/series";
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

  const range = parseChartRange(new URL(request.url).searchParams.get("range"));
  const chart = await getSymbolChart(symbol, range);
  return NextResponse.json(chart);
}
