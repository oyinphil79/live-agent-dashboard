import OpenAI from "openai";
import type { Response, ResponseInputItem } from "openai/resources/responses/responses";
import { propagateAttributes, startActiveObservation, startObservation } from "@langfuse/tracing";
import { AGENT_VERSION, SYSTEM_PROMPT, productCatalog } from "./agent";
import { MODEL, PRICE, costOf } from "./pricing";
import { TOOL_DEFS, runTool } from "./tools";
import type { IncidentId, Incidents, Tokens, ToolCall, ToolName } from "./types";

const MAX_TOOL_ROUNDS = 3;
const REVOKED_KEY = "sk-proj-revoked0000000000000000000000000000000000";
const INCIDENT_NAMES: Record<IncidentId, string> = {
  orderDown: "order-service-down",
  slowTools: "slow-tool-apis",
  hugePrompt: "huge-prompt",
  revokedKey: "revoked-key",
};

// Reasoning summaries need a verified OpenAI organisation. If the API refuses them, stop asking.
let reasoningSummaries = true;

export interface AgentRun {
  reply: string;
  tokens: Tokens;
  cost: number;
  tools: ToolCall[];
  error?: string;
  traceId?: string;
}

/**
 * One customer message = one trace (`shopnow-support`), shaped per the Langfuse best practices:
 *   handle-support-message   (agent: customer message in, reply out)
 *   ├─ generate-response     (generation: every model call, with reasoning, usage and cost)
 *   ├─ track_order           (tool: arguments in, result or error out)
 *   └─ generate-response     ...
 */
export async function runAgent(apiKey: string, message: string, incidents: Incidents, sessionId: string): Promise<AgentRun> {
  const active = (Object.keys(incidents) as IncidentId[]).filter((k) => incidents[k]).map((k) => INCIDENT_NAMES[k]);
  return propagateAttributes(
    {
      traceName: "shopnow-support",
      sessionId,
      version: AGENT_VERSION,
      tags: ["synthetic-traffic", ...active.map((name) => `incident:${name}`)],
      metadata: { incidents: active.join(",") || "none", app: "live-agent-dashboard" },
    },
    () =>
      startActiveObservation(
        "handle-support-message",
        async (agent) => {
          agent.update({ input: message, metadata: { maxToolRounds: MAX_TOOL_ROUNDS } });
          const run = await agentLoop(apiKey, message, incidents);
          agent.update(run.error ? { output: { error: run.error }, level: "ERROR", statusMessage: run.error } : { output: run.reply });
          return { ...run, traceId: agent.traceId };
        },
        { asType: "agent" },
      ),
  );
}

async function agentLoop(apiKey: string, message: string, incidents: Incidents): Promise<AgentRun> {
  const client = new OpenAI({ apiKey: incidents.revokedKey ? REVOKED_KEY : apiKey, maxRetries: 0, timeout: 45_000 });
  const instructions = SYSTEM_PROMPT + (incidents.hugePrompt ? productCatalog() : "");
  const tokens: Tokens = { input: 0, output: 0, reasoning: 0 };
  const tools: ToolCall[] = [];
  // Stateless conversation (store: false): every round resends the full history, so each
  // generation in Langfuse shows exactly the context the model had when it decided.
  const input: ResponseInputItem[] = [{ role: "user", content: message }];

  try {
    for (let round = 1; round <= MAX_TOOL_ROUNDS + 1; round++) {
      const toolChoice = round > MAX_TOOL_ROUNDS ? "none" : "auto";
      const gen = startObservation(
        "generate-response",
        {
          model: MODEL,
          input: { instructions, input: forTrace(input), tools: TOOL_DEFS, tool_choice: toolChoice },
          modelParameters: { reasoning_effort: "low", tool_choice: toolChoice },
          metadata: { round },
        },
        { asType: "generation" },
      );

      let res: Response;
      try {
        res = await callModel(client, instructions, input, toolChoice);
      } catch (e) {
        gen.update({ level: "ERROR", statusMessage: errMsg(e), output: { error: errMsg(e) } }).end();
        throw e;
      }

      const usage = res.usage;
      const step: Tokens = {
        input: usage?.input_tokens ?? 0,
        output: usage?.output_tokens ?? 0,
        reasoning: usage?.output_tokens_details?.reasoning_tokens ?? 0,
      };
      const cached = usage?.input_tokens_details?.cached_tokens ?? 0;
      tokens.input += step.input;
      tokens.output += step.output;
      tokens.reasoning += step.reasoning;
      gen
        .update({
          model: res.model,
          output: { output: forTrace(res.output) },
          // Exclusive buckets, as Langfuse expects: cached and reasoning tokens are not double counted.
          usageDetails: {
            input: step.input - cached,
            input_cached_tokens: cached,
            output: step.output - step.reasoning,
            output_reasoning_tokens: step.reasoning,
            total: step.input + step.output,
          },
          // Same price the dashboard uses, so Langfuse and the dashboard agree.
          costDetails: {
            input: (step.input * PRICE.input) / 1e6,
            output: (step.output * PRICE.output) / 1e6,
            total: costOf(step),
          },
        })
        .end();

      const calls = res.output.filter((o) => o.type === "function_call");
      if (calls.length === 0) return { reply: res.output_text, tokens, cost: costOf(tokens), tools };

      input.push(...(res.output as ResponseInputItem[]));
      for (const call of calls) {
        const output = await startActiveObservation(
          call.name,
          async (tool) => {
            const args = parseArgs(call.arguments);
            tool.update({ input: args, metadata: { callId: call.call_id } });
            const t0 = Date.now();
            try {
              const result = await runTool(call.name, args, incidents);
              tools.push({ name: call.name as ToolName, args, ms: Date.now() - t0, ok: true });
              tool.update({ output: result });
              return JSON.stringify(result);
            } catch (e) {
              const error = errMsg(e);
              tools.push({ name: call.name as ToolName, args, ms: Date.now() - t0, ok: false, error });
              tool.update({ output: { error }, level: "ERROR", statusMessage: error });
              return JSON.stringify({ error });
            }
          },
          { asType: "tool" },
        );
        input.push({ type: "function_call_output", call_id: call.call_id, output });
      }
    }
    return { reply: "", tokens, cost: costOf(tokens), tools, error: "agent did not finish" };
  } catch (e) {
    return { reply: "", tokens, cost: costOf(tokens), tools, error: errMsg(e) };
  }
}

async function callModel(client: OpenAI, instructions: string, input: ResponseInputItem[], toolChoice: "auto" | "none"): Promise<Response> {
  const request = (summary: boolean) =>
    client.responses.create({
      model: MODEL,
      instructions,
      input,
      tools: TOOL_DEFS,
      tool_choice: toolChoice,
      reasoning: summary ? { effort: "low", summary: "auto" } : { effort: "low" },
      store: false,
      include: ["reasoning.encrypted_content"],
    });
  if (!reasoningSummaries) return request(false);
  try {
    return await request(true);
  } catch (e) {
    if (e instanceof OpenAI.BadRequestError && /summar|verif/i.test(e.message)) {
      reasoningSummaries = false;
      return request(false);
    }
    throw e;
  }
}

/** Drops encrypted reasoning blobs (unreadable, large) from what gets traced; summaries stay. */
function forTrace<T>(items: T[]): T[] {
  return items.map((item) => {
    if (item && typeof item === "object" && "encrypted_content" in item) {
      const { encrypted_content: _drop, ...rest } = item as Record<string, unknown>;
      return rest as T;
    }
    return item;
  });
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    return {};
  }
}

export function errMsg(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof OpenAI.APIError && e.status && !msg.startsWith(String(e.status))) return `${e.status} ${msg}`.slice(0, 300);
  return msg.slice(0, 300);
}
