import { NextResponse } from "next/server";
import { requireAuthedRateLimit } from "@/lib/api-guard";
import { getSymbolPeers } from "@/lib/detail";
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

  const capRaw = Number(new URL(request.url).searchParams.get("cap") ?? "");
  const cap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : undefined;
  const peers = await getSymbolPeers(symbol, cap);
  return NextResponse.json({ peers });
}
