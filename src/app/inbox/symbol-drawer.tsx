"use client";

import { useEffect, useState } from "react";
import {
  CHART_RANGES,
  DISPLAY_CURRENCIES,
  formatMoney,
  formatPct,
  formatPrice,
  type ChartRange,
  type DisplayCurrency,
  type PeerQuote,
  type SeriesPoint,
  type SeriesStatus,
  type SymbolDetail,
} from "@/lib/types";
import { SLOW_DOWN } from "@/lib/copy";
import { formatAsOf } from "@/lib/market";
import { TrendChart } from "./trend-chart";

const CCY_KEY = "sw_display_ccy";

function loadCcy(): DisplayCurrency {
  if (typeof window === "undefined") return "INR";
  const stored = window.localStorage.getItem(CCY_KEY);
  return (DISPLAY_CURRENCIES as readonly string[]).includes(stored ?? "")
    ? (stored as DisplayCurrency)
    : "INR";
}

function tone(value: number | null) {
  if (value === null || value === 0) return "text-[#8b97a8]";
  return value > 0 ? "text-[#3ee0a0]" : "text-[#ff6b7a]";
}

type ChartBody = {
  quote: SymbolDetail["quote"];
  series: { range: ChartRange; points: SeriesPoint[]; status: SeriesStatus; source: string };
};

export function SymbolPanel({
  symbol,
  variant,
  onClose,
  onOpenSymbol,
  onAdd,
}: {
  symbol: string | null;
  variant: "docked" | "sheet";
  onClose: () => void;
  onOpenSymbol: (symbol: string) => void;
  onAdd: (symbol: string) => Promise<void>;
}) {
  const [range, setRange] = useState<ChartRange>("3m");
  const [ccy, setCcy] = useState<DisplayCurrency>("INR");
  const [chart, setChart] = useState<ChartBody | null>(null);
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [fxStatus, setFxStatus] = useState<SeriesStatus>("unavailable");
  const [peers, setPeers] = useState<PeerQuote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    setCcy(loadCcy());
  }, []);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setError(null);
    setChartLoading(true);
    setPeers(null);
    fetch(`/api/symbols/${encodeURIComponent(symbol)}/chart?range=${range}`)
      .then(async (res) => {
        const json = (await res.json()) as ChartBody & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Could not load chart");
        if (!cancelled) setChart(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });

    fetch(`/api/symbols/${encodeURIComponent(symbol)}/peers`)
      .then(async (res) => {
        const json = (await res.json()) as { peers?: PeerQuote[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? SLOW_DOWN);
        if (!cancelled) setPeers(json.peers ?? []);
      })
      .catch(() => {
        if (!cancelled) setPeers([]);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/fx?ccy=${ccy}`)
      .then(async (res) => {
        const json = (await res.json()) as {
          usdToCcy?: number | null;
          status?: SeriesStatus;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? SLOW_DOWN);
        if (!cancelled) {
          setFxRate(json.usdToCcy ?? null);
          setFxStatus(json.status ?? "unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFxRate(null);
          setFxStatus("unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [ccy]);

  function changeCcy(next: DisplayCurrency) {
    setCcy(next);
    window.localStorage.setItem(CCY_KEY, next);
  }

  const quote = chart?.quote;
  const local = quote && fxRate !== null ? quote.price * fxRate : null;
  const inner = (
    <>
      {!symbol ? (
        <p className="mt-8 text-sm text-[#8b97a8]">
          Click a name to see trend, FX, and related names.
        </p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] tracking-[0.18em] text-[#8b97a8] uppercase">Cached name</p>
              <h2 className="mt-1 font-mono text-2xl">{symbol}</h2>
            </div>
            <button onClick={onClose} className="rounded-full border border-[#232a34] px-3 py-1 text-sm lg:hidden">
              Close
            </button>
          </div>

          {error ? <p className="mt-6 text-sm text-[#ff6b7a]">{error}</p> : null}

          <div className="mt-6">
            <p className="text-3xl font-semibold">{quote ? formatPrice(quote.price) : "—"}</p>
            <p className={`mt-1 text-sm ${tone(quote?.sessionChangePct ?? null)}`}>
              Session {formatPct(quote?.sessionChangePct ?? null)}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-lg">
                {local !== null ? formatMoney(local, ccy) : `${ccy} unavailable`}
              </p>
              <select
                value={ccy}
                onChange={(e) => changeCcy(e.target.value as DisplayCurrency)}
                className="rounded-lg border border-[#232a34] bg-[#14181e] px-2 py-1 text-sm"
              >
                {DISPLAY_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-[11px] text-[#8b97a8]">
              {quote ? `USD quote as of ${formatAsOf(new Date(quote.quoteAsOf))} · ${quote.quoteStatus}` : "No quote"}
              {fxRate !== null
                ? ` · 1 USD = ${fxRate.toFixed(4)} ${ccy} (${fxStatus})`
                : " · FX missing"}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {CHART_RANGES.map((item) => (
              <button
                key={item}
                onClick={() => setRange(item)}
                className={`rounded-full px-3 py-1 text-xs ${
                  range === item ? "bg-[#e8edf4] text-[#0b0d10]" : "border border-[#232a34]"
                }`}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="mt-3">
            {chart?.series.points.length ? (
              <TrendChart points={chart.series.points} fxRate={fxRate} />
            ) : (
              <div className="flex h-44 items-center justify-center rounded-xl border border-[#232a34] text-sm text-[#8b97a8]">
                {chartLoading ? "Loading trend…" : "No trend series for this range"}
              </div>
            )}
            <p className="mt-2 text-[11px] text-[#8b97a8]">
              {chart
                ? `Series ${chart.series.status} · ${chart.series.source}. Chart uses today’s ${ccy} rate on historical USD closes — not historical FX.`
                : "Waiting on series."}
              {chartLoading && chart ? " Refreshing range…" : ""}
            </p>
          </div>

          <section className="mt-8">
            <h3 className="text-sm font-medium">Related names</h3>
            <p className="mt-1 text-[11px] text-[#8b97a8]">Vendor peers, not a researched competitor set.</p>
            {peers === null ? (
              <p className="mt-3 text-sm text-[#8b97a8]">Loading related names…</p>
            ) : peers.length === 0 ? (
              <p className="mt-3 text-sm text-[#8b97a8]">No related tickers for this name.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {peers.map((peer) => (
                  <li
                    key={peer.symbol}
                    className="flex items-center justify-between rounded-xl border border-[#232a34] bg-[#14181e] px-3 py-2"
                  >
                    <button
                      onClick={() => onOpenSymbol(peer.symbol)}
                      className="text-left font-mono text-sm underline"
                    >
                      {peer.symbol}
                    </button>
                    <div className="flex items-center gap-3 text-sm">
                      <span>{peer.quoteStatus === "unavailable" ? "—" : formatPrice(peer.price)}</span>
                      <span className={tone(peer.sessionChangePct)}>{formatPct(peer.sessionChangePct)}</span>
                      <button
                        disabled={adding === peer.symbol}
                        onClick={async () => {
                          setAdding(peer.symbol);
                          await onAdd(peer.symbol);
                          setAdding(null);
                        }}
                        className="text-[11px] underline"
                      >
                        Add
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-8 text-[11px] text-[#8b97a8]">
            Delayed free data. Session clock is US; international tickers (e.g. SAP.DE, 7203.T) may be stale
            outside US hours. Excess vs SPY is a US-market benchmark. FX is an ECB-style mid from Frankfurter,
            display only.
          </p>
        </>
      )}
    </>
  );

  if (variant === "docked") {
    return (
      <>
        <aside className="sticky top-6 hidden min-h-[70vh] rounded-2xl border border-[#232a34] bg-[#0b0d10] p-5 lg:block">
          {inner}
        </aside>
        {symbol ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/50 lg:hidden" onClick={onClose}>
            <aside
              className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[#232a34] bg-[#0b0d10] p-5"
              onClick={(event) => event.stopPropagation()}
            >
              {inner}
            </aside>
          </div>
        ) : null}
      </>
    );
  }

  return null;
}
