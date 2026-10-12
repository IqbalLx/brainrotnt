import { Hono } from "hono";
import { z } from "zod";
import type { UhpClient } from "../../infra/uhp-client";
import type { SseStats } from "../agent-state-stream/route";

const injectSchema = z.object({
  status: z.enum(["idle", "working", "blocked", "done"]),
  pane: z.string().default("debug"),
  agent: z.string().default("debug-agent"),
  project: z.string().default("brainrotnt"),
  cwd: z.string().default(""),
  branch: z.string().nullable().default(null),
  machine: z.string().nullable().default(null),
});

/**
 * Splits "the UI does not update" into its three hops:
 *   GET  /api/debug/agent-state   what the UHP client saw from Luvus (frame counts per event, the recent
 *                                 frames it acted on and what it did with each; ?frames=N, default 50),
 *                                 its pane table, each source (this computer's socket and every Luvus
 *                                 machine followed over SSH), and how many SSE clients are listening.
 *   POST /api/debug/agent-state   {status, ...} publishes a state as if Luvus sent it, so the SSE stream
 *                                 and the UI can be tested without Luvus.
 * Like every route, it answers only localhost (see infra/local-only).
 */
export function createDebugAgentStateRoute(uhpClient: UhpClient, sse: SseStats) {
  const route = new Hono();

  route.get("/", (c) => {
    const requested = Number(c.req.query("frames") ?? 50);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 0), 200) : 50;
    const snapshot = uhpClient.debug();
    return c.json({ ...snapshot, recent: limit ? snapshot.recent.slice(-limit) : [], sse });
  });

  route.post("/", async (c) => {
    const parsed = injectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    uhpClient.inject(parsed.data);
    return c.json({ ok: true, injected: parsed.data, listeners: uhpClient.debug().listeners });
  });

  return route;
}
