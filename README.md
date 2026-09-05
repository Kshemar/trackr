# After Last Look

A **time-aware** market watchlist: it stores what you last acknowledged, then ranks names by what meaningfully changed since then — including excess return vs SPY — and labels delayed or cached data instead of pretending quotes are live.

Stack: **Next.js (App Router) + Prisma + Neon Postgres + Finnhub (Yahoo fallback) + Vercel**. $0 hobby tiers.

## Why this exists

A normal watchlist answers “what is the price?” This answers **“what deserves my attention since I last looked?”**

- Snapshots are per user, not “vs previous close”
- Moves are compared to **SPY** over the same window
- Quiet names collapse so a 40-name list is scannable
- Cache + as-of timestamps are first-class (`fresh` / `stale` / `unavailable`)
- Click a cached name for a **trend chart**, **USD + local FX**, and **vendor-related peers**

**Attention rule:** `|Δ since last look| ≥ 2%` **or** `|excess vs SPY| ≥ 1.5%` **or** `volume ≥ 1.5×` 20-day average.

**Score:** `3*|px%| + 2*|excess%| + volume spike` (capped by sort only).

## Local setup (free)

1. Node 20+
2. Create a free [Neon](https://neon.tech) project. Copy the **pooled** URI to `DATABASE_URL` and the **direct** URI to `DIRECT_URL` (you can paste the same URI into both if Neon only shows one).
3. Optional: free [Finnhub](https://finnhub.io) API key (no card). Without it, quotes/search fall back to Yahoo’s public chart/search endpoints.
4. Copy env and install:

```bash
cp .env.example .env.local
# edit .env.local
npm install
npx prisma db push
npm run dev
```

After schema changes, run `npx prisma db push` again so `SeriesCache`, `FxCache`, `PeerCache`, and `RateBucket` exist.

**Rate limits:** 40 authenticated API calls per user per minute. Over that, the UI shows **Woah slow down buddy**. Finnhub is capped at ~50 calls/min globally; extra traffic uses cache and Yahoo.

**Exchanges:** Finnhub and Yahoo can quote many listings (US plus suffixes like `.DE`, `.T`, `.NS`). Search shows the vendor display symbol. The app’s session clock and SPY-relative score are still **US-centric**.

`AUTH_SECRET` must be a long random string in production (`openssl rand -base64 32`).

## Deploy on Vercel (free)

1. Push this repo to GitHub.
2. Import the project on [Vercel](https://vercel.com).
3. Set env vars: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `FINNHUB_API_KEY`.
4. Deploy. `postinstall` runs `prisma generate`. Run `npx prisma db push` once against Neon (local or Vercel’s CLI) so tables exist before the first request.

Not investment advice. Free-tier quotes are typically delayed. Finnhub free terms are non-commercial.

## Project map

- [`prisma/schema.prisma`](prisma/schema.prisma) — users, watchlist, caches, rate buckets, last-seen snapshots
- [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts) — per-user and Finnhub budgets
- [`src/lib/quotes.ts`](src/lib/quotes.ts) — Finnhub + Yahoo, shared cache, TTL by session
- [`src/lib/series.ts`](src/lib/series.ts) — chart ranges
- [`src/lib/fx.ts`](src/lib/fx.ts) — Frankfurter USD crosses
- [`src/lib/peers.ts`](src/lib/peers.ts) — Finnhub/Yahoo related tickers
- [`src/lib/attention.ts`](src/lib/attention.ts) — delta engine and acknowledge
- [`src/app/inbox/`](src/app/inbox/) — split inbox + symbol panel
