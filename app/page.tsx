"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertFeed } from "@/components/AlertFeed";
import { Header } from "@/components/Header";
import { IncidentsCard } from "@/components/IncidentsCard";
import { KpiTiles } from "@/components/KpiTiles";
import { MainChart } from "@/components/MainChart";
import { RecentRuns } from "@/components/RecentRuns";
import { RulesCard } from "@/components/RulesCard";
import { EMPTY_KEYS, type Keys, SetupCard } from "@/components/SetupCard";
import { StatusCard } from "@/components/StatusCard";
import { ToolsCard } from "@/components/ToolsCard";
import { CUSTOMER_MESSAGES } from "@/lib/agent";
import { DEFAULT_RULES, EMPTY_STATE, type MonitorState, type Rules, evaluate } from "@/lib/monitor";
import type { Alert, Incidents, RunResult, ToolName } from "@/lib/types";

const CAP = 40;
const PAUSE_MS = 1500;
const STORAGE = "agent-dashboard-keys";
const NO_INCIDENTS: Incidents = { orderDown: false, slowTools: false, hugePrompt: false, revokedKey: false };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Page() {
  const [keys, setKeys] = useState<Keys>(EMPTY_KEYS);
  const [incidents, setIncidents] = useState<Incidents>(NO_INCIDENTS);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [monitor, setMonitor] = useState<MonitorState>(EMPTY_STATE);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [running, setRunning] = useState(false);
  const [batch, setBatch] = useState(0);
  const [banner, setBanner] = useState("");

  // The loop reads the latest values through refs, so switches take effect on the next run.
  const live = useRef({ keys, incidents, rules, runs, monitor, running, gen: 0, loop: 0 });
  live.current = { ...live.current, keys, incidents, rules };
  const sessionId = useMemo(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), []);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE);
      if (saved) setKeys({ ...EMPTY_KEYS, ...JSON.parse(saved) });
    } catch {}
  }, []);
  const updateKeys = (k: Keys) => {
    setKeys(k);
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify(k));
    } catch {}
  };

  const postSlack = useCallback(async (alert: Alert) => {
    const webhook = live.current.keys.slack.trim();
    if (!webhook) return;
    const res = await fetch("/api/slack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ webhook, alert }) }).catch(() => null);
    if (!res?.ok) setBanner(`Slack: ${(await res?.json().catch(() => null))?.error ?? "could not post"}`);
  }, []);

  const runOnce = useCallback(async () => {
    const { keys: k, incidents: inc, runs: prev, gen } = live.current;
    const id = prev.length + 1;
    const message = CUSTOMER_MESSAGES[prev.length % CUSTOMER_MESSAGES.length];
    const headers: Record<string, string> = { "content-type": "application/json", "x-openai-key": k.openai.trim() };
    if (k.lfPublic.trim() && k.lfSecret.trim()) {
      headers["x-langfuse-public-key"] = k.lfPublic.trim();
      headers["x-langfuse-secret-key"] = k.lfSecret.trim();
      headers["x-langfuse-host"] = k.lfHost.trim();
    }
    const t0 = Date.now();
    let run: RunResult;
    try {
      const res = await fetch("/api/run", { method: "POST", headers, body: JSON.stringify({ message, incidents: inc, sessionId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      run = { id, at: Date.now(), message, ...data };
    } catch (e) {
      run = { id, at: Date.now(), message, reply: "", ms: Date.now() - t0, tokens: { input: 0, output: 0, reasoning: 0 }, cost: 0, tools: [], ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (gen !== live.current.gen) return; // reset while this run was in flight
    const nextRuns = [...prev, run];
    const { state, alerts: fresh } = evaluate(live.current.monitor, nextRuns, live.current.rules);
    live.current.runs = nextRuns;
    live.current.monitor = state;
    setRuns(nextRuns);
    setMonitor(state);
    if (fresh.length) {
      setAlerts((a) => [...a, ...fresh]);
      fresh.forEach(postSlack);
    }
  }, [postSlack, sessionId]);

  const toggle = async (on: boolean) => {
    live.current.running = on;
    setRunning(on);
    if (!on) return;
    const loop = ++live.current.loop;
    const active = () => live.current.running && live.current.loop === loop;
    setBanner("");
    setBatch(0);
    for (let n = 0; n < CAP && active(); n++) {
      await runOnce();
      if (live.current.loop === loop) setBatch(n + 1);
      if (n + 1 < CAP && active()) await sleep(PAUSE_MS);
    }
    if (!active()) return;
    setBanner(`Paused after ${CAP} runs so a forgotten tab doesn't keep spending. Press Start for ${CAP} more.`);
    live.current.running = false;
    setRunning(false);
  };

  const reset = () => {
    live.current = { ...live.current, runs: [], monitor: EMPTY_STATE, running: false, gen: live.current.gen + 1 };
    setRunning(false);
    setRuns([]);
    setMonitor(EMPTY_STATE);
    setAlerts([]);
    setBatch(0);
    setBanner("");
  };

  const firing = Object.keys(monitor.firing);
  const firingTools = new Set(firing.filter((r) => r.startsWith("tool:")).map((r) => r.slice(5) as ToolName));
  const flags = { cost: !!monitor.firing.cost, latency: !!monitor.firing.latency, errors: !!monitor.firing.errors, tools: firingTools.size > 0 };
  const titles = [...alerts].reverse().filter((a, i, all) => a.state === "FIRING" && monitor.firing[a.rule] && all.findIndex((b) => b.rule === a.rule) === i).map((a) => a.title);

  return (
    <div className="glow min-h-screen">
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
        <Header running={running} onToggle={toggle} count={batch} cap={CAP} canStart={!!keys.openai.trim()} tracing={!!(keys.lfPublic.trim() && keys.lfSecret.trim())} onReset={reset} />
        {banner && <p className="card px-5 py-3 text-sm text-ink-2">{banner}</p>}
        <SetupCard keys={keys} onChange={updateKeys} />
        <StatusCard learning={!monitor.baseline} goodRuns={runs.filter((r) => r.ok).length} firing={titles} />
        <KpiTiles runs={runs} alerts={flags} />
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="min-w-0 space-y-5 lg:col-span-2">
            <MainChart runs={runs} baseline={monitor.baseline} rules={rules} bands={monitor.bands} />
            <div className="grid gap-5 md:grid-cols-2">
              <ToolsCard runs={runs} firing={firingTools} />
              <IncidentsCard incidents={incidents} onChange={setIncidents} />
            </div>
            <RecentRuns runs={runs} />
          </div>
          <div className="min-w-0 space-y-5">
            <AlertFeed alerts={alerts} slackOn={!!keys.slack.trim()} />
            <RulesCard rules={rules} onChange={setRules} firing={flags} />
          </div>
        </div>
      </main>
    </div>
  );
}
