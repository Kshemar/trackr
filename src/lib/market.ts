export type MarketSession = "open" | "closed" | "pre" | "after";

export function getMarketSession(at = new Date()): MarketSession {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const mins = hour * 60 + minute;

  if (weekday === "Sat" || weekday === "Sun") return "closed";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "open";
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre";
  if (mins >= 16 * 60 && mins < 20 * 60) return "after";
  return "closed";
}

export function quoteTtlMs(session: MarketSession) {
  return session === "open" ? 2 * 60 * 1000 : 15 * 60 * 1000;
}

export function formatAsOf(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
