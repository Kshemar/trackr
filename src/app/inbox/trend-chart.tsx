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
