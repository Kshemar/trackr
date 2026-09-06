import type { SeriesPoint } from "@/lib/types";

export function TrendChart({
  points,
  fxRate,
}: {
  points: SeriesPoint[];
  fxRate: number | null;
}) {
  if (points.length < 2) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border border-[#232a34] text-sm text-[#8b97a8]">
        No trend series for this range
      </div>
    );
  }

  const values = points.map((p) => (fxRate ? p.close * fxRate : p.close));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 400;
  const h = 160;
  const pad = 8;

  const coords = values.map((value, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (value - min) / span) * (h - pad * 2);
    return `${x},${y}`;
  });

  const line = `M ${coords.join(" L ")}`;
  const area = `${line} L ${w - pad},${h - pad} L ${pad},${h - pad} Z`;
  const up = values[values.length - 1] >= values[0];
  const stroke = up ? "#3ee0a0" : "#ff6b7a";
  const fill = up ? "rgba(62,224,160,0.16)" : "rgba(255,107,122,0.16)";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" role="img" aria-label="Price trend">
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

function indexedPct(points: SeriesPoint[]) {
  const p0 = points[0]?.close;
  if (!p0) return [];
  return points.map((p) => ((p.close / p0) - 1) * 100);
}

function polyline(values: number[], w: number, h: number, pad: number, min: number, span: number) {
  return values
    .map((value, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (value - min) / span) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

export function CompareChart({
  a,
  b,
  labelA,
  labelB,
}: {
  a: SeriesPoint[];
  b: SeriesPoint[];
  labelA: string;
  labelB: string;
}) {
  const pa = indexedPct(a);
  const pb = indexedPct(b);
  const n = Math.min(pa.length, pb.length);
  if (n < 2) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-[#232a34] text-sm text-[#8b97a8]">
        Need two series in this range to compare
      </div>
    );
  }
  const va = pa.slice(0, n);
  const vb = pb.slice(0, n);
  const min = Math.min(...va, ...vb);
  const max = Math.max(...va, ...vb);
  const span = max - min || 1;
  const w = 400;
  const h = 200;
  const pad = 10;
  const zeroY = pad + (1 - (0 - min) / span) * (h - pad * 2);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-52 w-full" role="img" aria-label="Compare percent change">
        <line x1={pad} x2={w - pad} y1={zeroY} y2={zeroY} stroke="#232a34" strokeDasharray="4 4" />
        <polyline
          fill="none"
          stroke="#3ee0a0"
          strokeWidth="2"
          points={polyline(va, w, h, pad, min, span)}
        />
        <polyline
          fill="none"
          stroke="#f0c14b"
          strokeWidth="2"
          points={polyline(vb, w, h, pad, min, span)}
        />
      </svg>
      <div className="mt-2 flex gap-4 text-xs">
        <span className="text-[#3ee0a0]">{labelA}</span>
        <span className="text-[#f0c14b]">{labelB}</span>
      </div>
    </div>
  );
}
