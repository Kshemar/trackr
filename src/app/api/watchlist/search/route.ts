import { NextResponse } from "next/server";
import { requireAuthedRateLimit } from "@/lib/api-guard";
import { searchSymbols } from "@/lib/quotes";

export async function GET(request: Request) {
  const gated = await requireAuthedRateLimit();
  if (gated.error) return gated.error;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const hits = await searchSymbols(q);
  return NextResponse.json({ hits });
}
