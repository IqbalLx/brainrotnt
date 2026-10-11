import { Hono } from "hono";
import { findOpenSession, sessionView } from "../../sessions/session";

export const getCurrentSessionRoute = new Hono();

// Lets a reloaded page pick up the session it was in.
getCurrentSessionRoute.get("/current", async (c) => {
  const session = await findOpenSession();
  if (!session) return c.json({ error: "no_open_session" }, 404);
  return c.json(await sessionView(session));
});
