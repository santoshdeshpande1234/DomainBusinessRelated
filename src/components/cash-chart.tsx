// Running net position by month for each scenario. Server-rendered SVG: lines, a zero baseline,
// end labels and a per-month hover title; the table beside it carries the same numbers.
type Series = { key: string; label: string; values: number[] };

const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

export function CashChart({ series, format }: { series: Series[]; format: (n: number) => string }) {
  const W = 640, H = 240, L = 72, R = 112, T = 12, B = 28;
  const months = series[0]?.values.length ?? 0;
  if (!months) return null;
  const all = series.flatMap((s) => s.values).concat(0);
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1;
  const y0 = lo - pad, y1 = hi + pad;
  const x = (i: number) => L + (i / (months - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = [y0 + pad, (y0 + y1) / 2, y1 - pad];
  // Spread end labels so they don't overlap.
  const ends = series.map((s, i) => ({ i, y: y(s.values[months - 1]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) ends[k].y = Math.max(ends[k].y, ends[k - 1].y + 14);

  return (
    <figure className="viz">
      <ul className="mb-2 flex flex-wrap gap-4 text-xs text-muted" aria-hidden>
        {series.map((s, i) => <li key={s.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: COLORS[i] }} />{s.label}</li>)}
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Running net position by month for each scenario">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--faint)">{format(t)}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth="1" />
        <text x={W - R + 4} y={y(0)} dy="-0.4em" fontSize="10" fill="var(--faint)">break-even</text>
        {[1, 6, 12, 18, 24, 36].filter((m) => m <= months).map((m) => <text key={m} x={x(m - 1)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--faint)">{m === 1 ? "Month 1" : m}</text>)}
        {series.map((s, i) => (
          <polyline key={s.key} fill="none" stroke={COLORS[i]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, j) => `${x(j)},${y(v)}`).join(" ")} />
        ))}
        {ends.map((e) => (
          <text key={e.i} x={W - R + 8} y={e.y} dy="0.32em" fontSize="11" fill="var(--ink)">
            <tspan fill={COLORS[e.i]}>● </tspan>{series[e.i].label}
          </text>
        ))}
        {Array.from({ length: months }, (_, j) => (
          <rect key={j} x={x(j) - (W - L - R) / months / 2} y={T} width={(W - L - R) / months} height={H - T - B} fill="transparent">
            <title>{`Month ${j + 1}\n${series.map((s) => `${s.label}: ${format(s.values[j])}`).join("\n")}`}</title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}
