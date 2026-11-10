export type IncidentId = "orderDown" | "slowTools" | "hugePrompt" | "revokedKey";

export type Incidents = Record<IncidentId, boolean>;

export type ToolName = "track_order" | "check_return" | "delivery_estimate";

export interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
  ms: number;
  ok: boolean;
  error?: string;
}

export interface Tokens {
  input: number;
  output: number;
  reasoning: number;
}

export interface RunResult {
  id: number;
  at: number;
  message: string;
  reply: string;
  ms: number;
  tokens: Tokens;
  cost: number;
  tools: ToolCall[];
  ok: boolean;
  error?: string;
  traceId?: string;
  traceUrl?: string;
}

export type RuleId = "cost" | "latency" | "errors" | `tool:${ToolName}`;

export interface Alert {
  key: string;
  rule: RuleId;
  state: "FIRING" | "RESOLVED";
  at: number;
  runId: number;
  title: string;
  detail: string;
  cause: string;
  traceUrl?: string;
}

export interface Band {
  rule: RuleId;
  from: number;
  to: number | null;
}
