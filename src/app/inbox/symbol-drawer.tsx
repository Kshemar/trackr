"use client";

import { useCallback, useEffect, useState } from "react";
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
import { CompareChart, TrendChart } from "./trend-chart";

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

function ChartFetcher({
  symbol,
  range,
  onChart,
  onRateLimit,
  onRateClear,
}: {
  symbol: string;
  range: ChartRange;
  onChart: (symbol: string, chart: ChartBody | null, loading: boolean) => void;
  onRateLimit: () => void;
  onRateClear: () => void;
}) {
  useEffect(() => {
    let cancelled = false;
    onChart(symbol, null, true);
    fetch(`/api/symbols/${encodeURIComponent(symbol)}/chart?range=${range}`)
      .then(async (res) => {
        const json = (await res.json()) as ChartBody & { error?: string };
        if (res.status === 429) {
          onRateLimit();
          throw new Error(json.error ?? SLOW_DOWN);
        }
        if (!res.ok) throw new Error(json.error ?? "Could not load chart");
        onRateClear();
        if (!cancelled) onChart(symbol, json, false);
      })
      .catch(() => {
        if (!cancelled) onChart(symbol, null, false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, range, onChart, onRateClear, onRateLimit]);
  return null;
}

function SymbolChartColumn({
  symbol,
  chart,
  loading,
  ccy,
  fxRate,
  fxStatus,
  showPeers,
  peerCap,
  onUnpin,
  onOpenSymbol,
  onAdd,
  onRateLimit,
  onRateClear,
}: {
  symbol: string;
  chart: ChartBody | null;
  loading: boolean;
  ccy: DisplayCurrency;
  fxRate: number | null;
  fxStatus: SeriesStatus;
  showPeers: boolean;
  peerCap?: number;
  onUnpin: (symbol: string) => void;
  onOpenSymbol: (symbol: string) => void;
  onAdd: (symbol: string) => Promise<void>;
  onRateLimit: () => void;
  onRateClear: () => void;
}) {
  const [peers, setPeers] = useState<PeerQuote[] | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!showPeers) return;
    let cancelled = false;
    setPeers(null);
    fetch(`/api/symbols/${encodeURIComponent(symbol)}/peers${peerCap ? `?cap=${peerCap}` : ""}`)
      .then(async (res) => {
        const json = (await res.json()) as { peers?: PeerQuote[]; error?: string };
        if (res.status === 429) {
          onRateLimit();
          throw new Error(json.error ?? SLOW_DOWN);
        }
        if (!res.ok) throw new Error(json.error ?? SLOW_DOWN);
        onRateClear();
        if (!cancelled) setPeers(json.peers ?? []);
      })
      .catch(() => {
        if (!cancelled) setPeers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, showPeers, peerCap, onRateClear, onRateLimit]);

  const quote = chart?.quote;
  const local = quote && fxRate !== null ? quote.price * fxRate : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-mono text-xl">{symbol}</h2>
          <p className="mt-0.5 text-[11px] text-[#8b97a8]">
            {quote?.exchange ?? "—"} · delayed
          </p>
        </div>
        <button
          onClick={() => onUnpin(symbol)}
          className="rounded-full border border-[#232a34] px-2 py-0.5 text-xs"
          aria-label={`Unpin ${symbol}`}
        >
          ×
        </button>
      </div>
      <p className="mt-2 text-2xl font-semibold">{quote ? formatPrice(quote.price) : "—"}</p>
      <p className={`mt-1 text-sm ${tone(quote?.sessionChangePct ?? null)}`}>
        Session {formatPct(quote?.sessionChangePct ?? null)}
      </p>
      <p className="mt-2 text-sm">
        {local !== null ? formatMoney(local, ccy) : `${ccy} unavailable`}
      </p>
      <p className="mt-1 text-[11px] text-[#8b97a8]">
        {quote ? `USD as of ${formatAsOf(new Date(quote.quoteAsOf))} · ${quote.quoteStatus}` : "No quote"}
        {fxRate !== null ? ` · 1 USD = ${fxRate.toFixed(4)} ${ccy} (${fxStatus})` : ""}
      </p>
      <div className="mt-3">
        {chart?.series.points.length ? (
          <TrendChart points={chart.series.points} fxRate={fxRate} />
        ) : (
          <div className="flex h-44 items-center justify-center rounded-xl border border-[#232a34] text-sm text-[#8b97a8]">
            {loading ? "Loading trend…" : "No trend series for this range"}
          </div>
        )}
        <p className="mt-2 text-[11px] text-[#8b97a8]">
          {chart
            ? `Series ${chart.series.status} · ${chart.series.source}. Spot FX on USD closes.`
            : "Waiting on series."}
          {loading && chart ? " Refreshing range…" : ""}
        </p>
      </div>
      {showPeers ? (
        <section className="mt-6">
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
      ) : null}
    </div>
  );
}

export function SymbolPanel({
  symbols,
  onUnpin,
  onClose,
  onOpenSymbol,
  onAdd,
  onRateLimit,
  onRateClear,
}: {
  symbols: string[];
  onUnpin: (symbol: string) => void;
  onClose: () => void;
  onOpenSymbol: (symbol: string) => void;
  onAdd: (symbol: string) => Promise<void>;
  onRateLimit: () => void;
  onRateClear: () => void;
}) {
  const [range, setRange] = useState<ChartRange>("3m");
  const [ccy, setCcy] = useState<DisplayCurrency>("INR");
  const [compare, setCompare] = useState(false);
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [fxStatus, setFxStatus] = useState<SeriesStatus>("unavailable");
  const [charts, setCharts] = useState<Record<string, ChartBody | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCcy(loadCcy());
  }, []);

  useEffect(() => {
    if (symbols.length < 2) setCompare(false);
  }, [symbols.length]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/fx?ccy=${ccy}`)
      .then(async (res) => {
        const json = (await res.json()) as {
          usdToCcy?: number | null;
          status?: SeriesStatus;
          error?: string;
        };
        if (res.status === 429) {
          onRateLimit();
          throw new Error(json.error ?? SLOW_DOWN);
        }
        if (!res.ok) throw new Error(json.error ?? SLOW_DOWN);
        onRateClear();
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
  }, [ccy, onRateClear, onRateLimit]);

  function changeCcy(next: DisplayCurrency) {
    setCcy(next);
    window.localStorage.setItem(CCY_KEY, next);
  }

  const onChart = useCallback((symbol: string, chart: ChartBody | null, isLoading: boolean) => {
    setLoading((prev) => ({ ...prev, [symbol]: isLoading }));
    if (!isLoading || chart) {
      setCharts((prev) => ({ ...prev, [symbol]: chart }));
    }
  }, []);

  const visual = (
    <>
      {symbols.length === 0 ? (
        <p className="mt-8 text-sm text-[#8b97a8]">
          Click a name to see trend, FX, and related names. Pin a second name for side-by-side charts.
        </p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-[11px] tracking-[0.18em] text-[#8b97a8] uppercase">
              {symbols.length === 2 ? "Two names" : "Cached name"}
            </p>
            <button onClick={onClose} className="rounded-full border border-[#232a34] px-3 py-1 text-sm lg:hidden">
              Close
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
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
            {symbols.length === 2 ? (
              <button
                onClick={() => setCompare((v) => !v)}
                className={`rounded-full px-3 py-1 text-xs ${
                  compare ? "bg-[#f0c14b] text-[#0b0d10]" : "border border-[#232a34]"
                }`}
              >
                Compare
              </button>
            ) : null}
          </div>

          {compare && symbols.length === 2 ? (
            <div className="mt-4">
              <CompareChart
                a={charts[symbols[0]]?.series.points ?? []}
                b={charts[symbols[1]]?.series.points ?? []}
                labelA={symbols[0]}
                labelB={symbols[1]}
              />
              <p className="mt-2 text-[11px] text-[#8b97a8]">
                Indexed to 0% at the start of this range. Not a dollar overlay.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {symbols.map((sym) => {
                  const quote = charts[sym]?.quote;
                  const local = quote && fxRate !== null ? quote.price * fxRate : null;
                  return (
                    <div key={sym}>
                      <div className="flex justify-between">
                        <span className="font-mono">
                          {sym}
                          {quote?.exchange ? (
                            <span className="ml-2 font-sans text-[11px] text-[#8b97a8]">
                              {quote.exchange} · delayed
                            </span>
                          ) : null}
                        </span>
                        <button onClick={() => onUnpin(sym)} className="text-xs underline">
                          Unpin
                        </button>
                      </div>
                      <p className="text-lg">{quote ? formatPrice(quote.price) : "—"}</p>
                      <p className="text-sm text-[#8b97a8]">
                        {local !== null ? formatMoney(local, ccy) : `${ccy} unavailable`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={`mt-4 grid gap-6 ${symbols.length === 2 ? "sm:grid-cols-2" : ""}`}>
              {symbols.map((sym) => (
                <SymbolChartColumn
                  key={sym}
                  symbol={sym}
                  chart={charts[sym] ?? null}
                  loading={Boolean(loading[sym])}
                  ccy={ccy}
                  fxRate={fxRate}
                  fxStatus={fxStatus}
                  showPeers
                  peerCap={symbols.length === 2 ? 4 : undefined}
                  onUnpin={onUnpin}
                  onOpenSymbol={onOpenSymbol}
                  onAdd={onAdd}
                  onRateLimit={onRateLimit}
                  onRateClear={onRateClear}
                />
              ))}
            </div>
          )}

          <p className="mt-8 text-[11px] text-[#8b97a8]">
            Delayed free data. Session clock is US; international tickers may be stale outside US hours.
            Excess vs SPY is a US-market benchmark. FX is an ECB-style mid from Frankfurter, display only.
          </p>
        </>
      )}
    </>
  );

  return (
    <>
      {symbols.map((sym) => (
        <ChartFetcher
          key={`${sym}-${range}`}
          symbol={sym}
          range={range}
          onChart={onChart}
          onRateLimit={onRateLimit}
          onRateClear={onRateClear}
        />
      ))}
      <aside className="sticky top-6 hidden min-h-[70vh] rounded-2xl border border-[#232a34] bg-[#0b0d10] p-5 lg:block">
        {visual}
      </aside>
      {symbols.length > 0 ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 lg:hidden" onClick={onClose}>
          <aside
            className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-[#232a34] bg-[#0b0d10] p-5"
            onClick={(event) => event.stopPropagation()}
          >
            {visual}
          </aside>
        </div>
      ) : null}
    </>
  );
}
