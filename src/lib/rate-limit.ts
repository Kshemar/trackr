import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { SLOW_DOWN } from "./copy";

export { SLOW_DOWN };

export const USER_LIMIT = 40;
export const FINNHUB_LIMIT = 50;
const WINDOW_MS = 60_000;

export async function tryConsume(id: string, limit: number, n = 1, windowMs = WINDOW_MS): Promise<boolean> {
  const now = new Date();
  const row = await prisma.rateBucket.findUnique({ where: { id } });

  if (!row || now.getTime() - row.windowStart.getTime() >= windowMs) {
    await prisma.rateBucket.upsert({
      where: { id },
      create: { id, windowStart: now, count: n },
      update: { windowStart: now, count: n },
    });
    return n <= limit;
  }

  if (row.count + n > limit) return false;

  await prisma.rateBucket.update({
    where: { id },
    data: { count: { increment: n } },
  });
  return true;
}

export async function consumeUserRate(userId: string) {
  return tryConsume(`user:${userId}`, USER_LIMIT, 1);
}

export async function consumeFinnhub(n: number) {
  return tryConsume("finnhub:global", FINNHUB_LIMIT, n);
}

export async function peekFinnhub(n: number) {
  const id = "finnhub:global";
  const now = new Date();
  const row = await prisma.rateBucket.findUnique({ where: { id } });
  if (!row || now.getTime() - row.windowStart.getTime() >= WINDOW_MS) return n <= FINNHUB_LIMIT;
  return row.count + n <= FINNHUB_LIMIT;
}

export function slowDownResponse() {
  return NextResponse.json(
    { error: SLOW_DOWN },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}
