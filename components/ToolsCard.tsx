import { Wrench } from "lucide-react";
import { TOOL_NAMES, secs } from "@/lib/monitor";
import type { RunResult, ToolName } from "@/lib/types";
import { Card, Dot } from "./ui";

export function ToolsCard({ runs, firing }: { runs: RunResult[]; firing: Set<ToolName> }) {
  const calls = runs.flatMap((r) => r.tools);
  return (
    <Card title="Tools" icon={<Wrench size={15} strokeWidth={1.75} />}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-ink-3">
            <tr>
              <th className="pb-2 font-normal">Tool</th>
              <th className="pb-2 pl-4 text-right font-normal">Calls</th>
              <th className="pb-2 pl-4 text-right font-normal">Failed</th>
              <th className="pb-2 pl-4 text-right font-normal">Avg</th>
            </tr>
          </thead>
          <tbody>
            {TOOL_NAMES.map((name) => {
              const mine = calls.filter((c) => c.name === name);
              const failed = mine.filter((c) => !c.ok);
              const avg = mine.length ? mine.reduce((s, c) => s + c.ms, 0) / mine.length : 0;
              const lastErr = [...mine].reverse().find((c) => !c.ok)?.error;
              const alert = firing.has(name);
              return (
                <tr key={name} className="border-t border-line align-top">
                  <td className="py-2.5 pr-2">
                    <span className="flex items-center gap-2 font-mono">
                      <Dot tone={alert ? "bad" : mine.length ? "good" : "muted"} />
                      {name}
                    </span>
                    {lastErr && <span className={`mt-1 block pl-3.5 ${alert ? "text-bad" : "text-ink-3"}`}>{lastErr}</span>}
                  </td>
                  <td className="py-2.5 pl-4 text-right font-mono tabular-nums">{mine.length}</td>
                  <td className={`py-2.5 pl-4 text-right font-mono tabular-nums ${failed.length ? "text-bad" : ""}`}>{mine.length ? `${Math.round((failed.length / mine.length) * 100)}%` : "–"}</td>
                  <td className="py-2.5 pl-4 text-right font-mono tabular-nums">{mine.length ? secs(avg) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
