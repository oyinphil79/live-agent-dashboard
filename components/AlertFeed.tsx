import { BellRing, ExternalLink, Hash } from "lucide-react";
import type { Alert } from "@/lib/types";
import { Card } from "./ui";

export function AlertFeed({ alerts, slackOn }: { alerts: Alert[]; slackOn: boolean }) {
  return (
    <Card
      title="alerts-shopnow"
      icon={<Hash size={15} strokeWidth={1.75} />}
      action={<span className="text-xs text-ink-3">{slackOn ? "Also posting to Slack" : "Slack not connected"}</span>}
    >
      {alerts.length === 0 ? (
        <p className="text-sm text-ink-3">Quiet so far. Alerts will show up here.</p>
      ) : (
        <ul className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
          {[...alerts].reverse().map((a) => (
            <li key={a.key} className="flex gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-page text-ink-2">
                <BellRing size={15} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">Agent Monitor</span>
                  <span className="text-xs text-ink-3">
                    {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · run #{a.runId}
                  </span>
                </p>
                <p className="mt-0.5">
                  <span className={`mr-1.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${a.state === "FIRING" ? "bg-bad/10 text-bad" : "bg-good/10 text-good"}`}>{a.state}</span>
                  {a.title}
                </p>
                <p className="mt-1 text-ink-2">{a.detail}</p>
                <p className="mt-1 text-ink-2">
                  <span className="text-ink-3">Likely cause: </span>
                  {a.cause}
                </p>
                {a.traceUrl && (
                  <a href={a.traceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink">
                    Open trace in Langfuse <ExternalLink size={12} strokeWidth={1.75} />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
