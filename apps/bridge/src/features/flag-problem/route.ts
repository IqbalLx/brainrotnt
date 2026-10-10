import { Hono } from "hono";
import { flagProblem } from "./query";
import { flagProblemBody } from "./schema";

export const flagProblemRoute = new Hono();

flagProblemRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = flagProblemBody.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);
  }

  const flagId = flagProblem(parsed.data);
  if (!flagId) return c.json({ error: "problem_not_found" }, 404);
  return c.json({ flagId }, 201);
});
