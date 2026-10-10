import { Hono } from "hono";
import { getSessionSummary } from "./query";
import { sessionSummaryQuery } from "./schema";

export const sessionSummaryRoute = new Hono();

sessionSummaryRoute.get("/", async (c) => {
  const parsed = sessionSummaryQuery.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);
  }
  return c.json(await getSessionSummary(parsed.data.since));
});
