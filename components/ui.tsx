import type { ReactNode } from "react";

export function Card({ title, icon, action, children, className = "" }: { title?: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      {title && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
            {icon && <span className="text-ink-3">{icon}</span>}
            {title}
          </h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-ink" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}

export type Tone = "good" | "bad" | "warn" | "muted";
const DOT: Record<Tone, string> = { good: "bg-good", bad: "bg-bad", warn: "bg-warn", muted: "bg-ink-3" };

export function Dot({ tone }: { tone: Tone }) {
  return <span className={`inline-block size-1.5 shrink-0 rounded-full ${DOT[tone]}`} />;
}

export function Chip({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-0.5 text-xs text-ink-2">
      <Dot tone={tone} />
      {children}
    </span>
  );
}

export function PillButton({ children, onClick, disabled, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
