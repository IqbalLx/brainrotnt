import { Hono } from "hono";
import { findSession } from "../../sessions/session";
import { getSessionScore } from "./query";

export const getSessionScoreRoute = new Hono();

// The score screen is only available once the session has ended.
getSessionScoreRoute.get("/:id/score", async (c) => {
  const session = await findSession(c.req.param("id"));
  if (!session) return c.json({ error: "session_not_found" }, 404);
  if (!session.endedAt) return c.json({ error: "session_in_progress" }, 409);
  return c.json(await getSessionScore({ ...session, endedAt: session.endedAt }));
});
