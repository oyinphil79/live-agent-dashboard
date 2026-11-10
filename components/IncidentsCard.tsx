import { Zap } from "lucide-react";
import type { IncidentId, Incidents } from "@/lib/types";
import { Card, Dot, Switch } from "./ui";

const LIST: { id: IncidentId; name: string; what: string }[] = [
  { id: "orderDown", name: "Order service down", what: "track_order throws 503 upstream timeout. The agent still apologises, so runs look fine." },
  { id: "slowTools", name: "Slow tool APIs", what: "Order, returns and courier APIs each take 3 seconds to answer." },
  { id: "hugePrompt", name: "Huge prompt", what: "A 120-line product catalog is appended to the agent's prompt." },
  { id: "revokedKey", name: "Revoked API key", what: "Calls OpenAI with a fake key, so every run really fails." },
];

export function IncidentsCard({ incidents, onChange }: { incidents: Incidents; onChange: (i: Incidents) => void }) {
  return (
    <Card title="Break something" icon={<Zap size={15} strokeWidth={1.75} />}>
      <ul className="space-y-3">
        {LIST.map((inc) => (
          <li key={inc.id} className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm">
                <Dot tone={incidents[inc.id] ? "bad" : "muted"} />
                {inc.name}
              </p>
              <p className="mt-0.5 pl-3.5 text-xs text-ink-3">{inc.what}</p>
            </div>
            <Switch on={incidents[inc.id]} onChange={(v) => onChange({ ...incidents, [inc.id]: v })} label={inc.name} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
