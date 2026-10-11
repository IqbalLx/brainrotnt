import { Hono } from "hono";
import { sessionView } from "../../sessions/session";
import { startSession } from "./command";
import { startSessionBody } from "./schema";

export const startSessionRoute = new Hono();

startSessionRoute.post("/", async (c) => {
  const parsed = startSessionBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);

  const started = await startSession(parsed.data);
  if (!started) return c.json({ error: "no_problems" }, 404);
  // 200 with the session already open when an agent run asked for one; 201 for a new session.
  return c.json(await sessionView(started.session), started.resumed ? 200 : 201);
});
