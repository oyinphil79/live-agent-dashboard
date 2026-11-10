import { Minus, Plus, SlidersHorizontal } from "lucide-react";
import type { Rules } from "@/lib/monitor";
import { Card, Dot } from "./ui";

export function RulesCard({ rules, onChange, firing }: { rules: Rules; onChange: (r: Rules) => void; firing: { cost: boolean; latency: boolean; errors: boolean; tools: boolean } }) {
  const step = (k: keyof Rules, d: number) => onChange({ ...rules, [k]: Math.max(1.1, Math.round((rules[k] + d) * 10) / 10) });
  const rows = [
    { name: "Tool call failing", on: firing.tools, rule: "Any tool fails 3 calls in a row", clear: "at most 1 of its last 3 calls fails" },
    { name: "Run errors", on: firing.errors, rule: "2 of the last 3 runs fail", clear: "fewer than 2 of the last 3 fail" },
    { name: "Cost per run", on: firing.cost, rule: `3 runs in a row above ${rules.costX}× normal`, clear: "at most 1 of the last 3 is above", k: "costX" as const },
    { name: "Reply time", on: firing.latency, rule: `3 runs in a row above ${rules.latencyX}× normal`, clear: "at most 1 of the last 3 is above", k: "latencyX" as const },
  ];
  return (
    <Card title="Alert rules" icon={<SlidersHorizontal size={15} strokeWidth={1.75} />}>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.name} className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm">
                <Dot tone={r.on ? "bad" : "good"} />
                {r.name}
              </p>
              <p className="mt-0.5 pl-3.5 text-xs text-ink-2">Fires: {r.rule}</p>
              <p className="pl-3.5 text-xs text-ink-3">Clears: {r.clear}</p>
            </div>
            {r.k && (
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-line p-0.5">
                <button aria-label={`Lower ${r.name} threshold`} onClick={() => step(r.k, -0.5)} className="grid size-6 place-items-center rounded-full text-ink-2 hover:bg-page">
                  <Minus size={12} />
                </button>
                <span className="w-8 text-center font-mono text-xs tabular-nums">{rules[r.k]}×</span>
                <button aria-label={`Raise ${r.name} threshold`} onClick={() => step(r.k, 0.5)} className="grid size-6 place-items-center rounded-full text-ink-2 hover:bg-page">
                  <Plus size={12} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-3">Normal is the median of the first 5 good runs.</p>
    </Card>
  );
}
