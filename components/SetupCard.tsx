import { KeyRound } from "lucide-react";
import { Card } from "./ui";

export interface Keys {
  openai: string;
  lfPublic: string;
  lfSecret: string;
  lfHost: string;
  slack: string;
}
export const EMPTY_KEYS: Keys = { openai: "", lfPublic: "", lfSecret: "", lfHost: "https://cloud.langfuse.com", slack: "" };

const FIELDS: { k: keyof Keys; label: string; placeholder: string; secret?: boolean }[] = [
  { k: "openai", label: "OpenAI API key", placeholder: "sk-...", secret: true },
  { k: "lfPublic", label: "Langfuse public key", placeholder: "pk-lf-... (optional)" },
  { k: "lfSecret", label: "Langfuse secret key", placeholder: "sk-lf-... (optional)", secret: true },
  { k: "lfHost", label: "Langfuse host", placeholder: "https://cloud.langfuse.com" },
  { k: "slack", label: "Slack webhook", placeholder: "https://hooks.slack.com/services/... (optional)", secret: true },
];

export function SetupCard({ keys, onChange }: { keys: Keys; onChange: (k: Keys) => void }) {
  return (
    <Card title="Keys" icon={<KeyRound size={15} strokeWidth={1.75} />}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {FIELDS.map((f) => (
          <label key={f.k} className="grid gap-1 text-xs text-ink-2">
            {f.label}
            <input
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              spellCheck={false}
              value={keys[f.k]}
              placeholder={f.placeholder}
              onChange={(e) => onChange({ ...keys, [f.k]: e.target.value })}
              className="rounded-xl border border-line bg-page/60 px-3 py-2 font-mono text-xs text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-3">Kept in this tab&apos;s sessionStorage and sent only as request headers. Never saved or logged on the server.</p>
    </Card>
  );
}
