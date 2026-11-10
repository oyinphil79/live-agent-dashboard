import { NextResponse } from "next/server";
import { type LangfuseCredentials, projectUrl, withLangfuseProject } from "@/lib/langfuse";
import { runAgent } from "@/lib/openai";
import type { Incidents } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Keys arrive as headers and only live for this request. Never log them.
export async function POST(req: Request) {
  const apiKey = req.headers.get("x-openai-key")?.trim();
  if (!apiKey) return NextResponse.json({ error: "Missing x-openai-key header" }, { status: 400 });

  let body: { message?: unknown; incidents?: Partial<Incidents>; sessionId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.slice(0, 500) : "";
  if (!message) return NextResponse.json({ error: "Missing message" }, { status: 400 });

  const i = body.incidents ?? {};
  const incidents: Incidents = {
    orderDown: !!i.orderDown,
    slowTools: !!i.slowTools,
    hugePrompt: !!i.hugePrompt,
    revokedKey: !!i.revokedKey,
  };
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "dashboard";

  const publicKey = req.headers.get("x-langfuse-public-key")?.trim();
  const secretKey = req.headers.get("x-langfuse-secret-key")?.trim();
  const baseUrl = safeHost(req.headers.get("x-langfuse-host")) ?? "https://cloud.langfuse.com";
  const credentials: LangfuseCredentials | null = publicKey && secretKey ? { publicKey, secretKey, baseUrl } : null;
  const project = credentials ? projectUrl(credentials) : Promise.resolve(undefined); // resolved alongside the run

  const t0 = Date.now();
  const run = await withLangfuseProject(credentials, () => runAgent(apiKey, message, incidents, sessionId));
  const ms = Date.now() - t0;
  const base = await project;

  return NextResponse.json({
    ...run,
    ms,
    ok: !run.error,
    traceId: credentials ? run.traceId : undefined,
    traceUrl: base && run.traceId ? `${base}/traces/${run.traceId}` : undefined,
  });
}

function safeHost(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.hostname === "localhost" ? u.origin : undefined;
  } catch {
    return undefined;
  }
}
