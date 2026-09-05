import { NextResponse } from "next/server";
import { requireAuthedRateLimit } from "@/lib/api-guard";
import { getAttention } from "@/lib/attention";

export async function GET() {
  const gated = await requireAuthedRateLimit();
  if (gated.error) return gated.error;
  const payload = await getAttention(gated.session.userId);
  return NextResponse.json(payload);
}
