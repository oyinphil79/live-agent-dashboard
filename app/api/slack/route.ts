import { NextResponse } from "next/server";
import type { Alert } from "@/lib/types";

export const runtime = "nodejs";

const PREFIX = "https://hooks.slack.com/services/";

export async function POST(req: Request) {
  let body: { webhook?: unknown; alert?: Alert };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const webhook = typeof body.webhook === "string" ? body.webhook.trim() : "";
  if (!webhook.startsWith(PREFIX)) {
    return NextResponse.json({ error: `Webhook must start with ${PREFIX}` }, { status: 400 });
  }
  const a = body.alert;
  if (!a || typeof a.title !== "string") return NextResponse.json({ error: "Missing alert" }, { status: 400 });

  const icon = a.state === "FIRING" ? ":red_circle:" : ":large_green_circle:";
  const lines = [
    `${icon} *${a.state}*: ${clean(a.title)}`,
    clean(a.detail),
    `_Likely cause:_ ${clean(a.cause)}`,
  ];
  if (typeof a.traceUrl === "string" && a.traceUrl.startsWith("https://")) lines.push(`<${a.traceUrl}|Open trace in Langfuse>`);

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: lines.filter(Boolean).join("\n") }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json({ error: `Slack returned ${res.status}` }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not reach Slack" }, { status: 502 });
  }
}

const clean = (s: unknown) => String(s ?? "").replace(/[<>]/g, "").slice(0, 500);
