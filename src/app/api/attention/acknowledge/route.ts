import { NextResponse } from "next/server";
import { requireAuthedRateLimit } from "@/lib/api-guard";
import { acknowledge, getAttention } from "@/lib/attention";

export async function POST(request: Request) {
  const gated = await requireAuthedRateLimit();
  if (gated.error) return gated.error;
  const body = (await request.json().catch(() => null)) as { symbols?: string[] } | null;
  await acknowledge(gated.session.userId, body?.symbols);
  const payload = await getAttention(gated.session.userId);
  return NextResponse.json(payload);
}
