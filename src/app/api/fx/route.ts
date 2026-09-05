import { NextResponse } from "next/server";
import { requireAuthedRateLimit } from "@/lib/api-guard";
import { getUsdRate, parseDisplayCurrency } from "@/lib/fx";

export async function GET(request: Request) {
  const gated = await requireAuthedRateLimit();
  if (gated.error) return gated.error;

  const ccy = parseDisplayCurrency(new URL(request.url).searchParams.get("ccy"));
  const fx = await getUsdRate(ccy);
  return NextResponse.json({
    ccy,
    usdToCcy: fx.rate,
    asOf: fx.asOf?.toISOString() ?? null,
    status: fx.status,
  });
}
