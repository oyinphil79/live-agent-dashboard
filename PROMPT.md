# Build prompt: Live Agent Dashboard

I want to build a small Next.js app called "Live Agent Dashboard". Clients always ask "how will we know if the agent breaks at 2 am?", and I want a live answer: send real traffic to a tool-using agent, trace every run in Langfuse, break one of its tools on purpose, and watch an alert fire when a tool call keeps failing, then clear when it's fixed.

Use Next.js (App Router) with TypeScript and Tailwind, call OpenAI with the official `openai` SDK (Responses API with function tools), and trace with the `langfuse` JS SDK. No database and no login.

Here's how it should work:

1. **Keys.** The user pastes their own OpenAI API key and, optionally, their Langfuse public key, secret key and host (default `https://cloud.langfuse.com`). Keep them in sessionStorage, send them to the backend as `x-openai-key`, `x-langfuse-public-key`, `x-langfuse-secret-key` and `x-langfuse-host` headers, and never save or log them. Without Langfuse keys the app still runs; it just shows "Tracing off".

2. **The agent.** A support agent for ShopNow, an online store in India, on `gpt-5-mini` with reasoning effort `low`, with a short prompt (delivery times, a 10-day return window, UPI, cards and cash on delivery up to ₹5,000) and three tools backed by mock data in `lib/`:
   - `track_order(order_id)` returns status, courier and expected date.
   - `check_return(order_id)` says whether the order is still inside the 10-day window.
   - `delivery_estimate(pincode)` returns days to deliver for that pincode.

   The agent loop runs at most 3 tool rounds per run. Include 10 everyday customer messages, most of which need a tool ("Where is order SN10234?", "Can I still return SN10388?", "How long to deliver to 560001?").

3. **Traffic.** Start sends the messages one at a time to `POST /api/run`, with a short pause between them and a cap of 40 runs per session so a forgotten tab doesn't keep spending. Each run returns:
   - how long it took and its tokens (input, output, reasoning), summed across every model call in the run;
   - its cost, worked out from the token counts and the current OpenAI price for the model (one constant in `lib/`, easy to update);
   - every tool call with its name, arguments, duration, and ok/failed with the error message;
   - whether the run itself failed, with the error message;
   - the Langfuse trace ID and a link to the trace.

4. **Langfuse tracing.** Each run is one Langfuse trace (name `shopnow-support`, the customer message as input, the final reply as output, session ID per dashboard session). Each model call is a `generation` with the model, token usage and cost, and each tool call is a `span` with its arguments, result, and `level: "ERROR"` plus a status message when it fails. Flush before the route returns, and never let a Langfuse error break a run.

5. **Incidents.** Four real incidents you can switch on while traffic flows:
   - **Order service down:** `track_order` throws `503 upstream timeout` on every call. The agent still answers (it apologises), so the run looks fine on its own. This is the silent failure the tool rule exists to catch.
   - **Slow courier API:** `delivery_estimate` waits 4 seconds before answering.
   - **Huge prompt:** a generated product catalog of about 120 lines appended to the agent's prompt.
   - **Revoked API key:** a fake OpenAI key, so every run really fails.

6. **The monitor.** "Normal" is the median of the first 5 good runs.
   - **Tool failures (the headline rule):** tracked per tool. It fires when a tool fails in 3 calls in a row, and clears when at most 1 of that tool's last 3 calls failed. The alert names the tool, quotes the latest error, says how many runs were affected, and links to the latest failing Langfuse trace.
   - **Cost per run** (default 3× normal, since reply length alone moves it a lot) and **reply time** (1.5× normal) fire only when 3 runs in a row cross the line, and clear when at most 1 of the last 3 does. Real traffic is noisy and one odd reply shouldn't page anyone.
   - **Run errors:** fires when 2 of the last 3 runs fail.
   - Each alert says what changed and the likely cause, by comparing input, output and reasoning tokens and per-tool durations with normal. For example: "input tokens 9× normal, so the prompt grew", or "delivery_estimate takes 4.1 s against 0.2 s normally".

7. **Slack.** An optional incoming webhook: `POST /api/slack` posts each alert there (FIRING and RESOLVED, with the Langfuse trace link), and only accepts `https://hooks.slack.com/services/` URLs.

8. **The screen** is a live monitoring dashboard:
   - a header with a Start/Pause switch for the traffic, a run counter, and a "Tracing on / off" chip;
   - a status card ("Learning normal", "All clear", "2 alerts firing");
   - four KPI tiles with tiny sparklines (runs, reply time, cost per run, tool failure rate) that turn red when their alert fires;
   - a main chart with tabs for cost, reply time and tool failures, showing every run as a dot with the normal line, the alert line, failed runs and failed tool calls as red marks, and a band where each alert fired;
   - a "Tools" card with one row per tool: calls, failure rate, average duration, last error, and a red dot while its alert fires;
   - a "Recent runs" list with the message, the tool calls as small chips (green or red), duration and cost, and an "Open in Langfuse" link per run;
   - a "Break something" card with a switch per incident;
   - an alert rules card;
   - the alerts as a Slack-style channel feed with FIRING and RESOLVED messages.

Keep every file small: `app/page.tsx` for the screen and the traffic loop, a `components/` folder for the parts of the screen, two routes in `app/api/run` and `app/api/slack`, and `lib/` for the OpenAI agent loop, the mock tools, the Langfuse tracing, the monitor rules, the pricing and the sample agent.

For the look, keep it light and minimal, like a clean modern SaaS tool: a warm off-white page with a soft green and peach glow at the top, white rounded cards with a soft shadow, and black pill buttons. Use the Geist font, small line icons from lucide-react (no emoji), and chips with a small coloured dot for the presets and tool calls. Lots of white space, nothing loud.
