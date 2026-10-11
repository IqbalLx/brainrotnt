import { Hono } from "hono";
import { sessionView } from "../../sessions/session";
import { startSession } from "./command";
import { startSessionBody } from "./schema";

export const startSessionRoute = new Hono();

startSessionRoute.post("/", async (c) => {
  const parsed = startSessionBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);

  const session = await startSession(parsed.data);
  if (!session) return c.json({ error: "no_problems" }, 404);
  return c.json(await sessionView(session), 201);
});
