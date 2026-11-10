import { ExternalLink, ListTree } from "lucide-react";
import { secs, usd } from "@/lib/monitor";
import type { RunResult } from "@/lib/types";
import { Card, Chip } from "./ui";

export function RecentRuns({ runs }: { runs: RunResult[] }) {
  const recent = runs.slice(-8).reverse();
  return (
    <Card title="Recent runs" icon={<ListTree size={15} strokeWidth={1.75} />}>
      {recent.length === 0 ? (
        <p className="text-sm text-ink-3">No runs yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((r) => (
            <li key={r.id} className="grid gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm">
                  <span className="mr-2 font-mono text-xs text-ink-3">#{r.id}</span>
                  {r.message}
                </p>
                {r.traceUrl ? (
                  <a href={r.traceUrl} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1 text-xs text-ink-2 hover:text-ink">
                    Langfuse <ExternalLink size={12} strokeWidth={1.75} />
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-ink-3">not traced</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {r.tools.map((t, i) => (
                  <Chip key={i} tone={t.ok ? "good" : "bad"} title={t.error}>
                    <span className="font-mono">{t.name}</span>
                  </Chip>
                ))}
                {!r.ok && <Chip tone="bad">run failed</Chip>}
                <span className="ml-auto font-mono text-xs text-ink-3 tabular-nums">
                  {secs(r.ms)} · {usd(r.cost)}
                </span>
              </div>
              {r.ok ? r.reply && <p className="line-clamp-2 text-xs text-ink-2">{r.reply}</p> : <p className="text-xs text-bad">{r.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
