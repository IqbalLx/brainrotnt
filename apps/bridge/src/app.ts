import { Hono, type MiddlewareHandler } from "hono";
import type { SandboxMode } from "./infra/sandbox-runner";
import type { UhpClient } from "./infra/uhp-client";
import { serveStatic, type StaticAssets } from "./infra/static-assets";
import { mcpRoute } from "./mcp/route";
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
import { trySessionCodeRoute } from "./features/try-session-code/route";
import { listSessionsRoute } from "./features/list-sessions/route";
import { getCoverageRoute } from "./features/get-coverage/route";
import { listFlaggedRoute } from "./features/list-flagged/route";

export interface AppOptions {
  uhpClient: UhpClient;
  sandbox: SandboxMode;
  version: string;
  /** Who may call what: localhost only (infra/local-only) or the network mode (infra/access). Runs first. */
  access: MiddlewareHandler;
  /** Extra middleware for /api/*, such as CORS for the Vite dev server. */
  api?: MiddlewareHandler[];
  /** The built web app, served from the same port. Absent in development, where Vite serves it. */
  webAssets?: StaticAssets;
}

/** The whole bridge: API, agent-state stream, MCP and, in a release build, the web app. */
export function createApp({ uhpClient, sandbox, version, access, api = [], webAssets }: AppOptions) {
  const app = new Hono();
  app.use("*", access);
  for (const middleware of api) app.use("/api/*", middleware);

  const agentStateStream = createAgentStateStreamRoute(uhpClient);
  app.route("/api/agent-state/stream", agentStateStream.route);
  app.route("/api/debug/agent-state", createDebugAgentStateRoute(uhpClient, agentStateStream.stats));
  app.route("/api/problems/next", getNextProblemRoute);
  app.route("/api/attempts", submitAttemptRoute);
  app.route("/api/flags", flagProblemRoute);
  app.route("/api/coverage", getCoverageRoute);
  app.route("/api/flagged", listFlaggedRoute);
  for (const route of [listSessionsRoute, startSessionRoute, getCurrentSessionRoute, answerSessionQuestionRoute, skipSessionQuestionRoute, endSessionRoute, getSessionScoreRoute, revealHintRoute, trySessionCodeRoute]) {
    app.route("/api/sessions", route);
  }
  app.route("/mcp", mcpRoute);

  // `app` lets the launcher tell a running brainrotnt from something else on the port.
  app.get("/api/health", (c) => c.json({ ok: true, app: "brainrotnt", version, sandbox }));
  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  if (webAssets) app.get("*", serveStatic(webAssets));
  return app;
}
