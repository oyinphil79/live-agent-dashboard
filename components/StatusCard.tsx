import { CircleCheck, CircleDashed, Siren } from "lucide-react";
import { BASELINE_RUNS } from "@/lib/monitor";

export function StatusCard({ learning, goodRuns, firing }: { learning: boolean; goodRuns: number; firing: string[] }) {
  const [Icon, title, sub, tone] = learning
    ? [CircleDashed, "Learning normal", `${Math.min(goodRuns, BASELINE_RUNS)} of ${BASELINE_RUNS} good runs collected. Tool and error rules are already live.`, "text-ink-2"]
    : firing.length
      ? [Siren, `${firing.length} alert${firing.length > 1 ? "s" : ""} firing`, firing.join(" · "), "text-bad"]
      : [CircleCheck, "All clear", "Every rule is within its threshold.", "text-good"];
  return (
    <section className="card flex items-center gap-4 p-5">
      <div className={`grid size-11 place-items-center rounded-2xl bg-page ${tone}`}>
        <Icon size={22} strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className={`text-lg font-semibold tracking-tight ${firing.length && !learning ? "text-bad" : ""}`}>{title}</p>
        <p className="truncate text-sm text-ink-2">{sub}</p>
      </div>
    </section>
  );
}
