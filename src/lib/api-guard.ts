import { NextResponse } from "next/server";
import { getSession, type Session } from "@/lib/session";
import { consumeUserRate, slowDownResponse } from "@/lib/rate-limit";

export async function requireAuthedRateLimit(): Promise<
  { session: Session; error?: undefined } | { session?: undefined; error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const ok = await consumeUserRate(session.userId);
  if (!ok) return { error: slowDownResponse() };
  return { session };
}
