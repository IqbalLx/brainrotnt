import { Hono } from "hono";
import { getNextProblemQuery } from "./schema";
import { getNextProblem } from "./query";

export const getNextProblemRoute = new Hono();

getNextProblemRoute.get("/", async (c) => {
  const parsed = getNextProblemQuery.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const problem = await getNextProblem(parsed.data);
  return c.json(problem);
});
