import { createHash } from "node:crypto";
import { context, createContextKey, type Context, type Tracer, type TracerProvider } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { AlwaysOnSampler, BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor, type MaskFunction } from "@langfuse/otel";
import { setLangfuseTracerProvider } from "@langfuse/tracing";

/**
 * Every user brings their own Langfuse project, so traces are routed per request,
 * following "Project per request" in the Langfuse JS/TS SDK docs (Advanced features).
 * A routing provider, registered once, forwards Langfuse spans to a short-lived
 * provider carried in the request's OpenTelemetry context. Keys never leave the request.
 */

export interface LangfuseCredentials {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

const PROJECT_PROVIDER = createContextKey("langfuse.project-tracer-provider");
const NOOP_PROVIDER = new BasicTracerProvider(); // spans outside a request are dropped

class ProjectRoutingTracerProvider implements TracerProvider {
  getTracer(name: string, version?: string): Tracer {
    const resolve = (ctx: Context) =>
      ((ctx.getValue(PROJECT_PROVIDER) as TracerProvider | undefined) ?? NOOP_PROVIDER).getTracer(name, version);
    return {
      startSpan: (spanName, options, ctx = context.active()) => resolve(ctx).startSpan(spanName, options, ctx),
      startActiveSpan: ((spanName: string, ...args: unknown[]) => {
        const ctx = args.length >= 3 ? (args[1] as Context) : context.active();
        const tracer = resolve(ctx);
        return (tracer.startActiveSpan as (...a: unknown[]) => unknown).call(tracer, spanName, ...args);
      }) as Tracer["startActiveSpan"],
    };
  }
}

// Register once per process (guarded so dev hot reloads don't stack registrations).
const g = globalThis as { __langfuseRouting?: boolean };
if (!g.__langfuseRouting) {
  g.__langfuseRouting = true;
  // Next.js doesn't start an OTel SDK here, so register the async context manager ourselves.
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  setLangfuseTracerProvider(new ProjectRoutingTracerProvider());
}

// Users paste their own project keys, and this app's traffic is synthetic and broken on purpose,
// so keep it out of their production dashboards unless they choose otherwise.
export const TRACING_ENVIRONMENT = process.env.LANGFUSE_TRACING_ENVIRONMENT || "live-agent-dashboard";

/** Masks email addresses and Indian mobile numbers anywhere in traced input, output and metadata. */
export const maskPII: MaskFunction = ({ data }) => maskValue(data);

function maskValue(v: unknown): unknown {
  if (typeof v === "string") {
    return v
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
      .replace(/(?<!\d)(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, "[phone]");
  }
  if (Array.isArray(v)) return v.map(maskValue);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskValue(x)]));
  return v;
}

/**
 * Runs `fn` with tracing sent to the given project, then flushes and releases the
 * provider. A failed export never fails the request. Without credentials, `fn`
 * still runs and its spans are dropped.
 */
export async function withLangfuseProject<T>(credentials: LangfuseCredentials | null, fn: () => Promise<T>): Promise<T> {
  if (!credentials) return fn();
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [
      new LangfuseSpanProcessor({
        ...credentials, // always pass all three, so env vars are never used as a fallback
        environment: TRACING_ENVIRONMENT,
        mask: maskPII,
      }),
    ],
  });
  try {
    return await context.with(context.active().setValue(PROJECT_PROVIDER, provider), fn);
  } finally {
    await provider.shutdown().catch(() => console.error("Langfuse export failed"));
  }
}

// Project IDs are cached under a hash of the credentials, so keys are never held across requests.
const projectIds = new Map<string, string>();

/** Resolves the project's UI base URL, e.g. https://cloud.langfuse.com/project/abc. Undefined if Langfuse can't be reached in time. */
export async function projectUrl(credentials: LangfuseCredentials): Promise<string | undefined> {
  const cacheKey = createHash("sha256").update(`${credentials.baseUrl}\n${credentials.publicKey}\n${credentials.secretKey}`).digest("hex");
  let projectId = projectIds.get(cacheKey);
  if (!projectId) {
    try {
      const client = new LangfuseClient({ ...credentials, timeout: 5 });
      projectId = await Promise.race([client.getProjectId(), new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), 5000))]);
      projectIds.set(cacheKey, projectId);
    } catch {
      return undefined;
    }
  }
  return `${credentials.baseUrl}/project/${projectId}`;
}
