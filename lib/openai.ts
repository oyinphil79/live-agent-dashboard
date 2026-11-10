import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { SYSTEM_PROMPT, productCatalog } from "./agent";
import { MODEL, costOf } from "./pricing";
import { TOOL_DEFS, runTool } from "./tools";
import { Tracer } from "./tracing";
import type { Incidents, Tokens, ToolCall, ToolName } from "./types";

const MAX_TOOL_ROUNDS = 3;
const REVOKED_KEY = "sk-proj-revoked0000000000000000000000000000000000";

export interface AgentRun {
  reply: string;
  tokens: Tokens;
  cost: number;
  tools: ToolCall[];
  error?: string;
}

export async function runAgent(apiKey: string, message: string, incidents: Incidents, tracer: Tracer): Promise<AgentRun> {
  const client = new OpenAI({ apiKey: incidents.revokedKey ? REVOKED_KEY : apiKey, maxRetries: 0, timeout: 45_000 });
  const instructions = SYSTEM_PROMPT + (incidents.hugePrompt ? productCatalog() : "");
  const tokens: Tokens = { input: 0, output: 0, reasoning: 0 };
  const tools: ToolCall[] = [];
  let input: string | ResponseInputItem[] = message;
  let previous: string | undefined;

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const gen = tracer.generation(`model call ${round + 1}`, MODEL, input);
      let res: OpenAI.Responses.Response;
      try {
        res = await client.responses.create({
          model: MODEL,
          instructions,
          input,
          tools: TOOL_DEFS,
          tool_choice: round === MAX_TOOL_ROUNDS ? "none" : "auto",
          reasoning: { effort: "low" },
          previous_response_id: previous,
        });
      } catch (e) {
        tracer.endGeneration(gen, null, zero(), 0, errMsg(e));
        throw e;
      }

      const step: Tokens = {
        input: res.usage?.input_tokens ?? 0,
        output: res.usage?.output_tokens ?? 0,
        reasoning: res.usage?.output_tokens_details?.reasoning_tokens ?? 0,
      };
      tokens.input += step.input;
      tokens.output += step.output;
      tokens.reasoning += step.reasoning;
      tracer.endGeneration(gen, res.output_text || res.output, step, costOf(step));

      const calls = res.output.filter((o) => o.type === "function_call");
      if (calls.length === 0) return { reply: res.output_text, tokens, cost: costOf(tokens), tools };

      const outputs: ResponseInputItem[] = [];
      for (const call of calls) {
        const args = parseArgs(call.arguments);
        const span = tracer.span(call.name, args);
        const t0 = Date.now();
        try {
          const result = await runTool(call.name, args, incidents);
          tools.push({ name: call.name as ToolName, args, ms: Date.now() - t0, ok: true });
          tracer.endSpan(span, result);
          outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
        } catch (e) {
          const error = errMsg(e);
          tools.push({ name: call.name as ToolName, args, ms: Date.now() - t0, ok: false, error });
          tracer.endSpan(span, null, error);
          outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error }) });
        }
      }
      previous = res.id;
      input = outputs;
    }
    return { reply: "", tokens, cost: costOf(tokens), tools, error: "agent did not finish" };
  } catch (e) {
    return { reply: "", tokens, cost: costOf(tokens), tools, error: errMsg(e) };
  }
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    return {};
  }
}

const zero = (): Tokens => ({ input: 0, output: 0, reasoning: 0 });

export function errMsg(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof OpenAI.APIError && e.status && !msg.startsWith(String(e.status))) return `${e.status} ${msg}`.slice(0, 300);
  return msg.slice(0, 300);
}
