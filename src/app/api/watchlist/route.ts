import { NextResponse } from "next/server";
import { requireAuthedRateLimit } from "@/lib/api-guard";
import { addSymbol, listWatchlist, removeSymbol } from "@/lib/attention";

export async function GET() {
  const gated = await requireAuthedRateLimit();
  if (gated.error) return gated.error;
  const items = await listWatchlist(gated.session.userId);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const gated = await requireAuthedRateLimit();
  if (gated.error) return gated.error;
  const body = (await request.json().catch(() => null)) as { symbol?: string } | null;
  const result = await addSymbol(gated.session.userId, body?.symbol ?? "");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const gated = await requireAuthedRateLimit();
  if (gated.error) return gated.error;
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  const result = await removeSymbol(gated.session.userId, symbol);
  return NextResponse.json(result);
}
