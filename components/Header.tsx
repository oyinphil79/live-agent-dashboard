import { Activity, RotateCcw } from "lucide-react";
import { Chip, Switch } from "./ui";

export function Header({ running, onToggle, count, cap, canStart, tracing, onReset }: { running: boolean; onToggle: (v: boolean) => void; count: number; cap: number; canStart: boolean; tracing: boolean; onReset: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-xl bg-ink text-white">
          <Activity size={18} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight">Live Agent Dashboard</h1>
          <p className="text-xs text-ink-3">ShopNow support agent · gpt-5-mini</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Chip tone={tracing ? "good" : "muted"}>{tracing ? "Tracing on" : "Tracing off"}</Chip>
        <span className="font-mono text-xs text-ink-2 tabular-nums">
          {count} / {cap} this run
        </span>
        <button onClick={onReset} aria-label="Reset dashboard" title="Reset" className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-white hover:text-ink">
          <RotateCcw size={14} strokeWidth={1.75} />
        </button>
        <label className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm shadow-sm">
          <span className="w-12 text-ink-2">{running ? "Live" : "Start"}</span>
          <Switch on={running} onChange={onToggle} label="Send traffic" disabled={!canStart && !running} />
        </label>
      </div>
    </header>
  );
}
