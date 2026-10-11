import { Hono } from "hono";
import { findSession, finish, sessionView } from "../../sessions/session";

export const endSessionRoute = new Hono();

// Ending early leaves unanswered questions unresolved: they earn nothing and their explanations stay locked.
endSessionRoute.post("/:id/end", async (c) => {
  const id = c.req.param("id");
  const session = await findSession(id);
  if (!session) return c.json({ error: "session_not_found" }, 404);
  if (!session.endedAt) await finish(id, "ended_early");
  return c.json(await sessionView((await findSession(id))!));
});
