"use client";

import { useEffect, useRef, useState } from "react";
import { type Baseline, type Rules, secs, usd } from "@/lib/monitor";
import type { Band, RunResult } from "@/lib/types";

type Tab = "cost" | "latency" | "tools";
const TABS: { id: Tab; label: string }[] = [
  { id: "cost", label: "Cost per run" },
  { id: "latency", label: "Reply time" },
  { id: "tools", label: "Tool calls" },
];
const H = 240;
const PAD = { l: 68, r: 16, t: 14, b: 26 };

export function MainChart({ runs, baseline, rules, bands }: { runs: RunResult[]; baseline: Baseline | null; rules: Rules; bands: Band[] }) {
  const [tab, setTab] = useState<Tab>("cost");
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = Math.max(runs.length, 12);
  const x = (id: number) => PAD.l + ((id - 0.5) / n) * (w - PAD.l - PAD.r);
  const val = (r: RunResult) => (tab === "cost" ? r.cost : r.ms);
  const fmt = tab === "cost" ? usd : secs;
  const normal = baseline ? (tab === "cost" ? baseline.cost : baseline.ms) : null;
  const limit = normal !== null ? normal * (tab === "cost" ? rules.costX : rules.latencyX) : null;
  const maxCalls = Math.max(3, ...runs.map((r) => r.tools.length));
  const yMax = tab === "tools" ? maxCalls + 0.5 : Math.max(limit ? limit * 1.25 : 0, ...runs.filter((r) => r.ok).map(val), 1e-6) * 1.08;
  const y = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);
  const ticks = tab === "tools" ? Array.from({ length: maxCalls + 1 }, (_, i) => i) : [0, yMax / 2, yMax];
  const shown = bands.filter((b) => (tab === "tools" ? b.rule.startsWith("tool:") : b.rule === tab || b.rule === "errors"));
  const lastId = runs.length;
  const hovered = hover !== null ? runs[hover - 1] : null;

  return (
    <section className="card p-5">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-page p-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${tab === t.id ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <Legend tab={tab} />
      </header>
      <div ref={ref} className="relative w-full overflow-hidden" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={H} className="block" role="img" aria-label={`${TABS.find((t) => t.id === tab)?.label} per run`}>
          {shown.map((b, i) => (
            <rect key={i} x={x(b.from) - 4} width={Math.max(8, x(b.to ?? lastId) - x(b.from) + 8)} y={PAD.t} height={H - PAD.t - PAD.b} rx={6} className={b.rule === "errors" ? "fill-warn/10" : "fill-bad/10"} />
          ))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} className="stroke-line" />
              <text x={PAD.l - 8} y={y(t) + 3} textAnchor="end" className="fill-ink-3 font-mono text-[10px]">
                {tab === "tools" ? t : fmt(t)}
              </text>
            </g>
          ))}
          {tab !== "tools" && normal !== null && <RefLine y={y(normal)} w={w} label="normal" cls="stroke-good" />}
          {tab !== "tools" && limit !== null && <RefLine y={y(limit)} w={w} label="alert" cls="stroke-warn" />}
          {runs.map((r) => {
            const cx = x(r.id);
            const dim = hover !== null && hover !== r.id ? 0.45 : 1;
            if (tab === "tools") {
              return r.tools.map((t, i) => (
                <circle key={`${r.id}-${i}`} cx={cx} cy={y(i + 1)} r={4.5} opacity={dim} strokeWidth={2} className={t.ok ? "fill-good stroke-white" : "fill-bad stroke-white"} />
              ));
            }
            if (!r.ok) return <Cross key={r.id} x={cx} y={H - PAD.b - 7} opacity={dim} />;
            return <circle key={r.id} cx={cx} cy={y(val(r))} r={4.5} opacity={dim} strokeWidth={2} className={limit && val(r) > limit ? "fill-bad stroke-white" : "fill-ink stroke-white"} />;
          })}
          {runs.map((r) => (
            <rect key={`hit-${r.id}`} x={x(r.id) - (w - PAD.l - PAD.r) / n / 2} y={0} width={(w - PAD.l - PAD.r) / n} height={H} fill="transparent" onMouseEnter={() => setHover(r.id)} />
          ))}
          <text x={w - PAD.r} y={H - 6} textAnchor="end" className="fill-ink-3 text-[10px]">
            run #
          </text>
        </svg>
        {runs.length === 0 && <p className="absolute inset-0 grid place-items-center text-sm text-ink-3">Press Start to send traffic.</p>}
        {hovered && <Tooltip run={hovered} left={Math.min(x(hovered.id) + 12, w - 220)} />}
      </div>
    </section>
  );
}

function RefLine({ y, w, label, cls }: { y: number; w: number; label: string; cls: string }) {
  return (
    <g>
      <line x1={PAD.l} x2={w - PAD.r} y1={y} y2={y} strokeWidth={1.5} strokeDasharray="4 4" className={cls} />
      <text x={w - PAD.r} y={y - 5} textAnchor="end" className="fill-ink-2 text-[10px]">
        {label}
      </text>
    </g>
  );
}

function Cross({ x, y, opacity }: { x: number; y: number; opacity: number }) {
  return (
    <g opacity={opacity} className="stroke-bad" strokeWidth={2} strokeLinecap="round">
      <line x1={x - 4} y1={y - 4} x2={x + 4} y2={y + 4} />
      <line x1={x - 4} y1={y + 4} x2={x + 4} y2={y - 4} />
    </g>
  );
}

function Legend({ tab }: { tab: Tab }) {
  const items =
    tab === "tools"
      ? [["bg-good", "ok call"], ["bg-bad", "failed call"], ["bg-bad/20", "tool alert"]]
      : [["bg-ink", "run"], ["bg-good", "normal"], ["bg-warn", "alert line"], ["bg-bad", "failed run"], ["bg-bad/20", "alert firing"]];
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-ink-2">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${c}`} />
          {l}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ run, left }: { run: RunResult; left: number }) {
  return (
    <div className="pointer-events-none absolute top-2 w-52 rounded-xl border border-line bg-white p-3 text-xs shadow-lg" style={{ left }}>
      <p className="font-medium">Run #{run.id}</p>
      <p className="mt-0.5 line-clamp-2 text-ink-3">{run.message}</p>
      {run.ok ? (
        <dl className="mt-2 grid grid-cols-2 gap-y-0.5 font-mono tabular-nums">
          <dt className="text-ink-3">time</dt>
          <dd>{secs(run.ms)}</dd>
          <dt className="text-ink-3">cost</dt>
          <dd>{usd(run.cost)}</dd>
          <dt className="text-ink-3">in / out</dt>
          <dd>
            {run.tokens.input} / {run.tokens.output}
          </dd>
          <dt className="text-ink-3">reasoning</dt>
          <dd>{run.tokens.reasoning}</dd>
        </dl>
      ) : (
        <p className="mt-2 text-bad">{run.error}</p>
      )}
      {run.tools.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {run.tools.map((t, i) => (
            <li key={i} className={t.ok ? "text-ink-2" : "text-bad"}>
              {t.name} · {secs(t.ms)}
              {t.ok ? "" : " · failed"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
