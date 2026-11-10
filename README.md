# Live Agent Dashboard

Send real traffic to a tool-using support agent, trace every run in Langfuse, break something on purpose, and watch an alert fire, then clear when it's fixed. It's a live answer to "how will we know if the agent breaks at 2 am?"

Built with Next.js (App Router), TypeScript, Tailwind, the `openai` SDK (Responses API with function tools) and the Langfuse TypeScript SDK v6 (`@langfuse/tracing`, `@langfuse/otel`, `@langfuse/client`, built on OpenTelemetry). No database, no login.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000, paste your OpenAI API key, and optionally your Langfuse keys and a Slack incoming webhook, then flip **Start**. Keys stay in the tab's sessionStorage and only travel to the server as request headers (`x-openai-key`, `x-langfuse-*`). They are never saved or logged.

## What happens

- **Agent:** a ShopNow support agent on `gpt-5-mini` (reasoning effort `low`) with three mock tools: `track_order`, `check_return` and `delivery_estimate`. Each run allows up to 3 tool rounds.
- **Traffic:** 10 sample customer messages, one at a time with a 1.5 s pause, capped at 40 runs per Start.
- **Tracing:** each run is one Langfuse trace, `shopnow-support`, laid out like this:
  ```
  handle-support-message   agent        customer message in, reply out
  ├─ generate-response     generation   every model call: full input, reasoning summary, model, usage, cost
  ├─ track_order           tool         arguments in, result or error out (level ERROR on failure)
  └─ generate-response     generation   ...
  ```
  Traces are grouped into one session per dashboard tab and tagged `synthetic-traffic` plus `incident:<name>` for each active incident. They carry the agent version and land in the `live-agent-dashboard` environment, so the synthetic traffic stays out of your production dashboards. Set `LANGFUSE_TRACING_ENVIRONMENT` to change this. Emails and phone numbers are masked before export. Each user brings their own project keys, so traces are routed per request with Langfuse's "project per request" pattern. Keys live only for the request, and concurrent requests never mix projects.
- **Incidents:** order service down (`track_order` returns 503), slow tool APIs (3 s each), huge prompt (a 120-line catalog appended to the prompt) and revoked API key.
- **Rules:** normal is the median of the first 5 good runs.
  - A tool alert fires when that tool fails 3 calls in a row and clears when at most 1 of its last 3 calls fails.
  - Cost (3× normal) and reply time (1.5× normal) alerts fire after 3 runs in a row over the line and clear when at most 1 of the last 3 is over.
  - The run-errors alert fires when 2 of the last 3 runs fail.
- **Slack:** `POST /api/slack` posts FIRING and RESOLVED messages and only accepts `https://hooks.slack.com/services/` URLs.

The model price lives in `lib/pricing.ts`. Check it against OpenAI's pricing page and update it if needed. To point at a compatible endpoint or a local mock, set `OPENAI_BASE_URL`.

## Layout

```
app/page.tsx            screen + traffic loop
app/api/run/route.ts    runs the agent for one message
app/api/slack/route.ts  posts an alert to Slack
components/             dashboard cards
lib/agent.ts            prompt, sample messages, catalog
lib/tools.ts            mock tools + incidents
lib/openai.ts           agent loop + trace structure
lib/langfuse.ts         per-request Langfuse project routing, masking, trace links
lib/monitor.ts          baseline + alert rules
lib/pricing.ts          model + price
```

## Langfuse skill

`.claude/skills/langfuse` is the official [Langfuse agent skill](https://github.com/langfuse/skills), installed for Claude Code at commit `6fb2baf`. The tracing here follows its instrumentation guide and the Langfuse best-practices page.
