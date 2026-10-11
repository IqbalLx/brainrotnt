import { Hono } from "hono";
import { cors } from "hono/cors";
import { localOnly } from "./infra/local-only";
import { mcpRoute } from "./mcp/route";
import { getSandboxMode } from "./infra/sandbox-runner";
import { createUhpClient } from "./infra/uhp-client";
import { createAgentStateStreamRoute } from "./features/agent-state-stream/route";
import { createDebugAgentStateRoute } from "./features/debug-agent-state/route";
import { flagProblemRoute } from "./features/flag-problem/route";
import { getNextProblemRoute } from "./features/get-next-problem/route";
import { submitAttemptRoute } from "./features/submit-attempt/route";
import { answerSessionQuestionRoute } from "./features/answer-session-question/route";
import { endSessionRoute } from "./features/end-session/route";
import { getCurrentSessionRoute } from "./features/get-current-session/route";
import { getSessionScoreRoute } from "./features/get-session-score/route";
import { skipSessionQuestionRoute } from "./features/skip-session-question/route";
import { startSessionRoute } from "./features/start-session/route";
import { revealHintRoute } from "./features/reveal-hint/route";
import { listSessionsRoute } from "./features/list-sessions/route";
import { getCoverageRoute } from "./features/get-coverage/route";
import { listFlaggedRoute } from "./features/list-flagged/route";

const app = new Hono();
app.use("*", localOnly);
app.use("/api/*", cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));

const sandbox = await getSandboxMode();
if (sandbox !== "strict") {
  console.warn(
    sandbox === "unavailable"
      ? "[sandbox] network isolation is unavailable: reference solutions will not run. Set BRAINROTNT_ALLOW_UNSANDBOXED=1 to run them without it."
      : "[sandbox] running reference solutions WITHOUT network isolation (BRAINROTNT_ALLOW_UNSANDBOXED=1).",
  );
}

const uhpClient = createUhpClient();
await uhpClient.start();

const agentStateStream = createAgentStateStreamRoute(uhpClient);
app.route("/api/agent-state/stream", agentStateStream.route);
app.route("/api/debug/agent-state", createDebugAgentStateRoute(uhpClient, agentStateStream.stats));
app.route("/api/problems/next", getNextProblemRoute);
app.route("/api/attempts", submitAttemptRoute);
app.route("/api/flags", flagProblemRoute);
app.route("/api/coverage", getCoverageRoute);
app.route("/api/flagged", listFlaggedRoute);
for (const route of [listSessionsRoute, startSessionRoute, getCurrentSessionRoute, answerSessionQuestionRoute, skipSessionQuestionRoute, endSessionRoute, getSessionScoreRoute, revealHintRoute]) {
  app.route("/api/sessions", route);
}

app.route("/mcp", mcpRoute);

app.get("/api/health", (c) => c.json({ ok: true, sandbox }));

const port = Number(process.env.PORT ?? 8787);
console.log(`bridge listening on http://127.0.0.1:${port}`);

export default {
  port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
};
