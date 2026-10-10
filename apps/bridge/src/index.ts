import { Hono } from "hono";
import { cors } from "hono/cors";
import { createUhpClient } from "./infra/uhp-client";
import { createAgentStateStreamRoute } from "./features/agent-state-stream/route";
import { getNextProblemRoute } from "./features/get-next-problem/route";
import { submitAttemptRoute } from "./features/submit-attempt/route";

const app = new Hono();
app.use("/api/*", cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));

const uhpClient = createUhpClient();
await uhpClient.start();

app.route("/api/agent-state/stream", createAgentStateStreamRoute(uhpClient));
app.route("/api/problems/next", getNextProblemRoute);
app.route("/api/attempts", submitAttemptRoute);

app.get("/api/health", (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 8787);
console.log(`bridge listening on http://127.0.0.1:${port}`);

export default {
  port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
};
