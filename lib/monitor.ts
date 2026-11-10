import type { Alert, Band, RuleId, RunResult, ToolCall, ToolName } from "./types";

export const BASELINE_RUNS = 5;
export const TOOL_NAMES: ToolName[] = ["track_order", "check_return", "delivery_estimate"];

export interface Rules {
  costX: number;
  latencyX: number;
}
export const DEFAULT_RULES: Rules = { costX: 3, latencyX: 1.5 };

export interface Baseline {
  ms: number;
  cost: number;
  input: number;
  output: number;
  reasoning: number;
  toolCalls: number;
  toolMs: Partial<Record<ToolName, number>>;
}

export interface MonitorState {
  baseline: Baseline | null;
  firing: Partial<Record<RuleId, { since: number }>>;
  bands: Band[];
}
export const EMPTY_STATE: MonitorState = { baseline: null, firing: {}, bands: [] };

export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function computeBaseline(runs: RunResult[]): Baseline | null {
  const good = runs.filter((r) => r.ok).slice(0, BASELINE_RUNS);
  if (good.length < BASELINE_RUNS) return null;
  const toolMs: Baseline["toolMs"] = {};
  for (const name of TOOL_NAMES) {
    const ms = runs.flatMap((r) => r.tools).filter((t) => t.name === name && t.ok).slice(0, BASELINE_RUNS).map((t) => t.ms);
    if (ms.length) toolMs[name] = median(ms);
  }
  return {
    ms: median(good.map((r) => r.ms)),
    cost: median(good.map((r) => r.cost)),
    input: median(good.map((r) => r.tokens.input)),
    output: median(good.map((r) => r.tokens.output)),
    reasoning: median(good.map((r) => r.tokens.reasoning)),
    toolCalls: median(good.map((r) => r.tools.length)),
    toolMs,
  };
}

interface Check {
  rule: RuleId;
  fire: boolean;
  clear: boolean;
  title: string;
  detail: () => string;
  cause: () => string;
  traceUrl?: string;
}

/** Re-evaluates every rule after a new run. Returns the next state and any FIRING/RESOLVED alerts. */
export function evaluate(prev: MonitorState, runs: RunResult[], rules: Rules): { state: MonitorState; alerts: Alert[] } {
  const last = runs[runs.length - 1];
  if (!last) return { state: prev, alerts: [] };
  const baseline = prev.baseline ?? computeBaseline(runs);
  const checks: Check[] = [errorCheck(runs), ...TOOL_NAMES.map((n) => toolCheck(runs, n))];
  if (baseline && prev.baseline) checks.push(...metricChecks(runs, baseline, rules));

  const firing = { ...prev.firing };
  const bands = prev.bands.map((b) => ({ ...b }));
  const alerts: Alert[] = [];
  for (const c of checks) {
    const isFiring = !!firing[c.rule];
    if (!isFiring && c.fire) {
      firing[c.rule] = { since: last.id };
      bands.push({ rule: c.rule, from: last.id, to: null });
      alerts.push(makeAlert(c, "FIRING", last));
    } else if (isFiring && c.clear) {
      delete firing[c.rule];
      const band = bands.findLast((b) => b.rule === c.rule && b.to === null);
      if (band) band.to = last.id;
      alerts.push(makeAlert(c, "RESOLVED", last));
    }
  }
  return { state: { baseline, firing, bands }, alerts };
}

function makeAlert(c: Check, state: Alert["state"], run: RunResult): Alert {
  return {
    key: `${c.rule}-${state}-${run.id}`,
    rule: c.rule,
    state,
    at: Date.now(),
    runId: run.id,
    title: c.title,
    detail: c.detail(),
    cause: state === "FIRING" ? c.cause() : "Back within the normal range.",
    traceUrl: c.traceUrl ?? run.traceUrl,
  };
}

function errorCheck(runs: RunResult[]): Check {
  const last3 = runs.slice(-3);
  const failed = last3.filter((r) => !r.ok);
  const lastFail = [...runs].reverse().find((r) => !r.ok);
  return {
    rule: "errors",
    fire: last3.length === 3 && failed.length >= 2,
    clear: failed.length < 2,
    title: "Run errors",
    detail: () => `${failed.length} of the last 3 runs failed${lastFail ? `: "${lastFail.error}"` : ""}.`,
    cause: () => errorCause(lastFail?.error ?? ""),
    traceUrl: lastFail?.traceUrl,
  };
}

function toolCheck(runs: RunResult[], name: ToolName): Check {
  const calls: { call: ToolCall; run: RunResult }[] = runs.flatMap((run) => run.tools.filter((t) => t.name === name).map((call) => ({ call, run })));
  const last3 = calls.slice(-3);
  const failed = last3.filter((c) => !c.call.ok);
  const lastFail = [...calls].reverse().find((c) => !c.call.ok);
  const streak: typeof calls = [];
  for (let i = calls.length - 1; i >= 0 && !calls[i].call.ok; i--) streak.push(calls[i]);
  const affectedRuns = new Set((streak.length ? streak : failed).map((c) => c.run.id)).size;
  return {
    rule: `tool:${name}`,
    fire: last3.length === 3 && failed.length === 3,
    clear: failed.length <= 1,
    title: `Tool call failing: ${name}`,
    detail: () =>
      failed.length >= 2
        ? `${name} failed ${failed.length} of its last 3 calls, across ${affectedRuns} run${affectedRuns === 1 ? "" : "s"}. Latest error: "${lastFail?.call.error}".`
        : `${name} is succeeding again (${3 - failed.length} of its last 3 calls ok).`,
    cause: () => toolCause(lastFail?.call.error ?? ""),
    traceUrl: lastFail?.run.traceUrl,
  };
}

function metricChecks(runs: RunResult[], b: Baseline, rules: Rules): Check[] {
  const good = runs.filter((r) => r.ok).slice(BASELINE_RUNS).slice(-3);
  const defs = [
    { rule: "cost" as const, title: "Cost per run", x: rules.costX, base: b.cost, get: (r: RunResult) => r.cost, fmt: usd },
    { rule: "latency" as const, title: "Reply time", x: rules.latencyX, base: b.ms, get: (r: RunResult) => r.ms, fmt: secs },
  ];
  return defs.map((d) => {
    const over = good.filter((r) => d.get(r) > d.base * d.x);
    const now = good.length ? median(good.map(d.get)) : 0;
    return {
      rule: d.rule,
      fire: good.length === 3 && over.length === 3,
      clear: over.length <= 1,
      title: `${d.title} above ${d.x}× normal`,
      detail: () => `${d.title} is ${d.fmt(now)}, ${ratio(now, d.base)} normal (${d.fmt(d.base)}), over the last 3 runs.`,
      cause: () => (d.rule === "cost" ? costCause(good, b) : latencyCause(good, b)),
    };
  });
}

function costCause(runs: RunResult[], b: Baseline): string {
  const m = (f: (r: RunResult) => number) => median(runs.map(f));
  const input = m((r) => r.tokens.input) / Math.max(1, b.input);
  const reasoning = m((r) => r.tokens.reasoning) / Math.max(1, b.reasoning);
  const output = m((r) => r.tokens.output - r.tokens.reasoning) / Math.max(1, b.output - b.reasoning);
  const calls = m((r) => r.tools.length) / Math.max(1, b.toolCalls);
  const top = [
    { r: input, text: `input tokens ${input.toFixed(1)}× normal, so the prompt grew` },
    { r: reasoning, text: `reasoning tokens ${reasoning.toFixed(1)}× normal, so the model is thinking much more` },
    { r: output, text: `reply tokens ${output.toFixed(1)}× normal, so replies got longer` },
    { r: calls, text: `${calls.toFixed(1)}× the usual tool calls, so the agent loops more` },
  ].sort((x, y) => y.r - x.r)[0];
  return top.r > 1.3 ? cap(top.text) + "." : "No single token type stands out; replies are just more expensive.";
}

function latencyCause(runs: RunResult[], b: Baseline): string {
  const slow = TOOL_NAMES.flatMap((name) => {
    const ms = runs.flatMap((r) => r.tools).filter((t) => t.name === name).map((t) => t.ms);
    const base = b.toolMs[name];
    return ms.length && base && median(ms) > Math.max(1000, base * 3) ? [`${name} takes ${secs(median(ms))} against ${secs(base)} normally`] : [];
  });
  if (slow.length) return `${slow.join("; ")}. The tool APIs are the bottleneck, not the model.`;
  const input = median(runs.map((r) => r.tokens.input)) / Math.max(1, b.input);
  if (input > 2) return `Input tokens are ${input.toFixed(1)}× normal; a bigger prompt takes longer to read.`;
  return "The model itself is slower than usual; no tool or prompt change stands out.";
}

function errorCause(e: string): string {
  if (/401|incorrect api key|invalid.*key|revoked/i.test(e)) return "The OpenAI API key was rejected: it was revoked, rotated or mistyped.";
  if (/429|quota|rate/i.test(e)) return "OpenAI is rate limiting this key or the account is out of quota.";
  if (/timeout|timed out/i.test(e)) return "Calls to OpenAI are timing out.";
  if (/5\d\d/.test(e)) return "OpenAI is returning server errors.";
  return "The agent run is failing; open the trace for the full error.";
}

function toolCause(e: string): string {
  if (/503|timeout|unavailable/i.test(e)) return "The upstream service behind this tool is down or timing out. The agent still replies, so customers get apologies instead of answers.";
  if (/404|not found/i.test(e)) return "The tool can't find what the agent asks for; check the IDs the model is passing.";
  if (/400|invalid/i.test(e)) return "The model is passing bad arguments to this tool.";
  return "This tool keeps throwing; open the trace to see the arguments and error.";
}

export const usd = (n: number) => `$${n < 0.01 ? n.toFixed(5) : n.toFixed(3)}`;
export const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const ratio = (a: number, b: number) => `${(a / Math.max(b, 1e-9)).toFixed(1)}×`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
