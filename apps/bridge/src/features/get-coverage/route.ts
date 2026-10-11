import { Hono } from "hono";
import { getCoverage } from "./query";

export const getCoverageRoute = new Hono();

// The same counts get_coverage gives Claude Code, for the problem bank page.
getCoverageRoute.get("/", async (c) => c.json(await getCoverage()));
