import { Langfuse } from "langfuse";
import type { Tokens } from "./types";

export interface LangfuseKeys {
  publicKey?: string;
  secretKey?: string;
  host?: string;
}

type Obj = { end: (body?: Record<string, unknown>) => unknown };

/** Thin wrapper over Langfuse. Every call is a no-op when keys are missing, and never throws. */
export class Tracer {
  private lf: Langfuse | null = null;
  private trace: ReturnType<Langfuse["trace"]> | null = null;
  id?: string;
  url?: string;

  constructor(keys: LangfuseKeys, name: string, sessionId: string, input: string) {
    if (!keys.publicKey || !keys.secretKey) return;
    safe(() => {
      this.lf = new Langfuse({
        publicKey: keys.publicKey,
        secretKey: keys.secretKey,
        baseUrl: keys.host || "https://cloud.langfuse.com",
        flushAt: 50,
        requestTimeout: 5000,
        fetchRetryCount: 1,
      });
      this.lf.on("error", () => {});
      this.trace = this.lf.trace({ name, sessionId, input, tags: ["live-agent-dashboard"] });
      this.id = this.trace.id;
      this.url = this.trace.getTraceUrl();
    });
  }

  generation(name: string, model: string, input: unknown): Obj | null {
    return safe(() => this.trace?.generation({ name, model, input, startTime: new Date() }) ?? null) ?? null;
  }

  endGeneration(g: Obj | null, output: unknown, tokens: Tokens, cost: number, error?: string) {
    safe(() =>
      g?.end({
        output,
        usageDetails: { input: tokens.input, output: tokens.output, reasoning: tokens.reasoning },
        costDetails: { total: cost },
        ...(error ? { level: "ERROR", statusMessage: error } : {}),
      }),
    );
  }

  span(name: string, input: unknown): Obj | null {
    return safe(() => this.trace?.span({ name, input, startTime: new Date() }) ?? null) ?? null;
  }

  endSpan(s: Obj | null, output: unknown, error?: string) {
    safe(() => s?.end({ output, ...(error ? { level: "ERROR", statusMessage: error } : {}) }));
  }

  async finish(output: unknown, error?: string) {
    safe(() => this.trace?.update({ output, ...(error ? { tags: ["live-agent-dashboard", "error"] } : {}) }));
    try {
      await this.lf?.flushAsync();
    } catch {
      // tracing must never break a run
    }
  }
}

function safe<T>(f: () => T): T | undefined {
  try {
    return f();
  } catch {
    return undefined;
  }
}
