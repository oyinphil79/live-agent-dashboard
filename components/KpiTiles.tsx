import { secs, usd } from "@/lib/monitor";
import type { RunResult } from "@/lib/types";
import { Sparkline } from "./Sparkline";

interface Props {
  runs: RunResult[];
  alerts: { latency: boolean; cost: boolean; tools: boolean; errors: boolean };
}

export function KpiTiles({ runs, alerts }: Props) {
  const recent = runs.slice(-20);
  const good = recent.filter((r) => r.ok);
  const calls = recent.flatMap((r) => r.tools);
  const toolFailPct = calls.length ? (calls.filter((t) => !t.ok).length / calls.length) * 100 : 0;
  // Failure rate over a rolling window of 5 runs, for the sparkline.
  const rolling = recent.map((_, i) => {
    const win = recent.slice(Math.max(0, i - 4), i + 1).flatMap((r) => r.tools);
    return win.length ? win.filter((t) => !t.ok).length / win.length : 0;
  });
  const runFails = recent.map((_, i) => {
    const win = recent.slice(Math.max(0, i - 4), i + 1);
    return win.filter((r) => !r.ok).length / win.length;
  });
  const last = good[good.length - 1];

  const tiles = [
    { label: "Runs", value: String(runs.length), sub: `${runs.filter((r) => !r.ok).length} failed · failure trend`, spark: runFails, alert: alerts.errors },
    { label: "Reply time", value: last ? secs(last.ms) : "–", sub: "latest good run", spark: good.map((r) => r.ms), alert: alerts.latency },
    { label: "Cost per run", value: last ? usd(last.cost) : "–", sub: "latest good run", spark: good.map((r) => r.cost), alert: alerts.cost },
    { label: "Tool failure rate", value: calls.length ? `${toolFailPct.toFixed(0)}%` : "–", sub: `${calls.length} calls, last 20 runs`, spark: rolling, alert: alerts.tools },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((t) => (
        <section key={t.label} className={`card p-4 ${t.alert ? "ring-1 ring-bad/40" : ""}`}>
          <p className={`text-xs ${t.alert ? "text-bad" : "text-ink-2"}`}>{t.label}</p>
          <div className="mt-1 flex items-end justify-between gap-2">
            <div>
              <p className={`font-mono text-xl font-semibold tracking-tight tabular-nums ${t.alert ? "text-bad" : ""}`}>{t.value}</p>
              <p className="text-[11px] text-ink-3">{t.sub}</p>
            </div>
            <div className="hidden sm:block">
              <Sparkline values={t.spark} alert={t.alert} />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
