export function Sparkline({ values, alert }: { values: number[]; alert?: boolean }) {
  const w = 120;
  const h = 32;
  if (values.length < 2) return <svg width={w} height={h} aria-hidden />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="overflow-visible">
      <path d={d} fill="none" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" className={alert ? "stroke-bad" : "stroke-ink-3"} />
      <circle cx={lx} cy={ly} r={2.5} className={alert ? "fill-bad" : "fill-ink"} />
    </svg>
  );
}
