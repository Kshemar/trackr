"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AttentionPayload, AttentionRow, SymbolHit } from "@/lib/types";
import { formatPct, formatPrice } from "@/lib/types";
import { formatAsOf } from "@/lib/market";
import { SLOW_DOWN } from "@/lib/copy";
import { SymbolPanel } from "./symbol-drawer";

function tone(value: number | null) {
  if (value === null || value === 0) return "text-[#8b97a8]";
  return value > 0 ? "text-[#3ee0a0]" : "text-[#ff6b7a]";
}

function StatusPill({ status }: { status: AttentionRow["quoteStatus"] }) {
  const label =
    status === "fresh" ? "Fresh cache" : status === "stale" ? "Stale cache" : "Unavailable";
  const color =
    status === "fresh" ? "border-[#3ee0a0]/40 text-[#3ee0a0]" : status === "stale" ? "border-[#f0c14b]/50 text-[#f0c14b]" : "border-[#ff6b7a]/50 text-[#ff6b7a]";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${color}`}>{label}</span>
  );
}

function RowCard({
  row,
  pinIndex,
  onOpen,
  onPrefetch,
  onRemove,
  onAck,
}: {
  row: AttentionRow;
  pinIndex: number | null;
  onOpen: (symbol: string) => void;
  onPrefetch: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onAck: (symbol: string) => void;
}) {
  return (
    <article
      className={`cursor-pointer rounded-2xl border bg-[#14181e] p-3 ${
        pinIndex ? "border-[#e8edf4]" : "border-[#232a34]"
      }`}
      onClick={() => onOpen(row.symbol)}
      onMouseEnter={() => onPrefetch(row.symbol)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {pinIndex ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e8edf4] text-[11px] font-medium text-[#0b0d10]">
                {pinIndex}
              </span>
            ) : null}
            <h3 className="font-mono text-lg font-medium">{row.symbol}</h3>
            <StatusPill status={row.quoteStatus} />
          </div>
          <p className="mt-1 text-sm text-[#8b97a8]">
            {formatPrice(row.price)} · session {formatPct(row.sessionChangePct)}
          </p>
        </div>
        <div className="text-right">
          <p className={`font-mono text-lg ${tone(row.changeSinceSeenPct)}`}>
            {formatPct(row.changeSinceSeenPct)}
          </p>
          <p className="text-[11px] text-[#8b97a8]">since last look</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {row.reasons.map((reason) => (
          <span key={reason} className="rounded-full bg-[#0b0d10] px-2.5 py-1 text-xs text-[#c5ced9]">
            {reason}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8b97a8]">
        <span>
          Quote as of {formatAsOf(new Date(row.quoteAsOf))}
          {row.excessVsSpyPct !== null ? ` · vs SPY ${formatPct(row.excessVsSpyPct)}` : ""}
          {row.volumeRatio !== null ? ` · vol ${row.volumeRatio.toFixed(1)}×` : ""}
        </span>
        <span className="flex gap-2">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onAck(row.symbol);
            }}
            className="underline"
          >
            Caught up
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onRemove(row.symbol);
            }}
            className="underline"
          >
            Remove
          </button>
        </span>
      </div>
    </article>
  );
}

export function InboxClient({
  email,
  initial,
}: {
  email: string;
  initial: AttentionPayload;
}) {
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SymbolHit[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const onRateLimit = useCallback(() => setToast(SLOW_DOWN), []);
  const onRateClear = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const sessionLabel = useMemo(() => {
    if (data.marketSession === "open") return "US cash session open";
    if (data.marketSession === "pre") return "Pre-market";
    if (data.marketSession === "after") return "After hours";
    return "Market closed";
  }, [data.marketSession]);

  const allRows = useMemo(
    () => [...data.attention, ...data.quiet, ...data.unavailable],
    [data],
  );

  function togglePin(symbol: string) {
    setSelected((prev) => {
      if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
      if (prev.length < 2) return [...prev, symbol];
      return [prev[1], symbol];
    });
  }

  function noteResponse(res: Response) {
    if (res.status === 429) {
      onRateLimit();
      return "rate" as const;
    }
    if (res.ok) onRateClear();
    return res.ok ? ("ok" as const) : ("err" as const);
  }

  function prefetch(symbol: string) {
    void fetch(`/api/symbols/${encodeURIComponent(symbol)}/chart?range=3m`).then((res) => {
      noteResponse(res);
    });
  }

  useEffect(() => {
    const first = allRows.slice(0, 4).map((row) => row.symbol);
    const t = window.setTimeout(() => first.forEach(prefetch), 600);
    return () => window.clearTimeout(t);
  }, [allRows]);

  async function refreshAttention() {
    const res = await fetch("/api/attention");
    if (noteResponse(res) === "rate") return;
    if (res.ok) setData((await res.json()) as AttentionPayload);
  }

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 1) {
      setHits([]);
      return;
    }
    const res = await fetch(`/api/watchlist/search?q=${encodeURIComponent(value)}`);
    if (noteResponse(res) === "rate") return;
    if (!res.ok) return;
    const json = (await res.json()) as { hits: SymbolHit[] };
    setHits(json.hits);
  }

  async function add(symbol: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    const json = (await res.json()) as { error?: string };
    setBusy(false);
    if (res.status === 429) {
      onRateLimit();
      return;
    }
    if (!res.ok) {
      setMessage(json.error ?? "Could not add symbol.");
      return;
    }
    onRateClear();
    setQuery("");
    setHits([]);
    await refreshAttention();
  }

  async function remove(symbol: string) {
    setBusy(true);
    const res = await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" });
    setBusy(false);
    if (noteResponse(res) === "rate") return;
    setSelected((prev) => prev.filter((s) => s !== symbol));
    await refreshAttention();
  }

  async function ack(symbols?: string[]) {
    setBusy(true);
    const res = await fetch("/api/attention/acknowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols }),
    });
    if (noteResponse(res) === "rate") {
      setBusy(false);
      return;
    }
    if (res.ok) setData((await res.json()) as AttentionPayload);
    setBusy(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  const list = (
    <>
      <section className="relative mt-8">
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Add a ticker — AAPL, SAP.DE, 7203.T…"
          className="w-full rounded-xl border border-[#232a34] bg-[#14181e] px-4 py-3 outline-none focus:border-[#8b97a8]"
        />
        {hits.length > 0 ? (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-[#232a34] bg-[#14181e]">
            {hits.map((hit) => (
              <li key={hit.symbol + (hit.displaySymbol ?? "")}>
                <button
                  disabled={busy}
                  onClick={() => add(hit.symbol)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-[#0b0d10]"
                >
                  <span className="font-mono">{hit.displaySymbol ?? hit.symbol}</span>
                  <span className="truncate text-[#8b97a8]">{hit.description}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {query && hits.length === 0 ? (
          <button disabled={busy} onClick={() => add(query)} className="mt-2 text-sm underline">
            Add {query.toUpperCase()} anyway
          </button>
        ) : null}
        {message ? <p className="mt-2 text-sm text-[#ff6b7a]">{message}</p> : null}
        <p className="mt-2 text-[11px] text-[#8b97a8]">Pin up to two names for side-by-side charts.</p>
      </section>

      {data.attention.length === 0 && data.quiet.length === 0 && data.unavailable.length === 0 ? (
        <p className="mt-12 text-[#8b97a8]">
          Add a few names. The first visit captures a baseline; the second visit is the product.
        </p>
      ) : null}

      {data.attention.length > 0 ? (
        <section className="mt-8 space-y-3">
          {data.attention.map((row) => (
            <RowCard
              key={row.symbol}
              row={row}
              pinIndex={selected.includes(row.symbol) ? selected.indexOf(row.symbol) + 1 : null}
              onOpen={togglePin}
              onPrefetch={prefetch}
              onAck={(s) => ack([s])}
              onRemove={remove}
            />
          ))}
        </section>
      ) : data.quiet.length > 0 ? (
        <p className="mt-8 text-sm text-[#8b97a8]">Nothing crossed the attention bar. Quiet list is below.</p>
      ) : null}

      {data.quiet.length > 0 ? (
        <details className="mt-8" open={data.attention.length === 0}>
          <summary className="cursor-pointer text-sm text-[#8b97a8]">
            Quiet ({data.quiet.length}) — below 2% / 1.5% vs SPY / 1.5× volume
          </summary>
          <div className="mt-3 space-y-3">
            {data.quiet.map((row) => (
              <RowCard
                key={row.symbol}
                row={row}
                pinIndex={selected.includes(row.symbol) ? selected.indexOf(row.symbol) + 1 : null}
                onOpen={togglePin}
                onPrefetch={prefetch}
                onAck={(s) => ack([s])}
                onRemove={remove}
              />
            ))}
          </div>
        </details>
      ) : null}

      {data.unavailable.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm text-[#8b97a8]">Could not quote</h2>
          <div className="mt-3 space-y-3">
            {data.unavailable.map((row) => (
              <RowCard
                key={row.symbol}
                row={row}
                pinIndex={selected.includes(row.symbol) ? selected.indexOf(row.symbol) + 1 : null}
                onOpen={togglePin}
                onPrefetch={prefetch}
                onAck={(s) => ack([s])}
                onRemove={remove}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );

  const gridClass =
    selected.length === 2
      ? "mt-2 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] lg:items-start lg:gap-8"
      : "mt-2 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,28rem)] lg:items-start lg:gap-8";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 xl:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.18em] text-[#8b97a8] uppercase">Trackr</p>
          <h1 className="mt-1 text-3xl font-semibold">Track your stocks</h1>
          <p className="mt-2 text-sm text-[#8b97a8]">
            {sessionLabel} · source {data.dataSource}
            {data.dataSource !== "finnhub" ? " (fallback)" : ""} · delayed free data
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-[#8b97a8] sm:inline">{email}</span>
          <button
            disabled={busy}
            onClick={() => ack()}
            className="rounded-full bg-[#e8edf4] px-4 py-2 text-[#0b0d10]"
          >
            Caught up on all
          </button>
          <button onClick={logout} className="rounded-full border border-[#232a34] px-4 py-2">
            Sign out
          </button>
        </div>
      </header>

      <div className={gridClass}>
        <div>{list}</div>
        <SymbolPanel
          symbols={selected}
          onUnpin={(symbol) => setSelected((prev) => prev.filter((s) => s !== symbol))}
          onClose={() => setSelected([])}
          onOpenSymbol={togglePin}
          onAdd={add}
          onRateLimit={onRateLimit}
          onRateClear={onRateClear}
        />
      </div>

      {toast ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#14181e] px-5 py-2.5 text-sm shadow-lg ring-1 ring-[#f0c14b]">
          {toast}
        </div>
      ) : null}

      <footer className="mt-16 border-t border-[#232a34] pt-6 text-xs text-[#8b97a8]">
        Not investment advice. Quotes may be delayed or served from cache when the vendor rate-limits.
        Meaningful change = |price since last look| ≥ 2%, |excess vs SPY| ≥ 1.5%, or volume ≥ 1.5× 20-day
        average. Finnhub/Yahoo can quote many exchanges; this app’s session clock and SPY comparison are
        US-centric. Pin up to two names; use Compare for a percent overlay.
      </footer>
    </div>
  );
}
