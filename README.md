# Live Agent Dashboard

Send real traffic to a tool-using support agent, trace every run in Langfuse, break something on purpose, and watch an alert fire, then clear when it's fixed. It's a live answer to "how will we know if the agent breaks at 2 am?"

Built with Next.js (App Router), TypeScript, Tailwind, the `openai` SDK (Responses API with function tools) and the `langfuse` SDK. No database, no login.

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
- **Tracing:** each run is a Langfuse trace (`shopnow-support`). Each model call is a generation with tokens and cost, and each tool call is a span (`level: ERROR` when it fails). Every run and alert links to its trace.
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
lib/openai.ts           agent loop
lib/tracing.ts          Langfuse wrapper (no-op without keys, never throws)
lib/monitor.ts          baseline + alert rules
lib/pricing.ts          model + price
```
