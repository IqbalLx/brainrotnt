import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { UhpClient } from "../../infra/uhp-client";

const DEBUG_LOG = process.env.UHP_DEBUG === "1";
// Well under Bun's default 10 s idle timeout, in case a server without per-request timeouts serves this.
const PING_MS = 5_000;

export interface SseStats {
  clients: number;
  opened: number;
  sent: number;
  lastSentAt: string | null;
}

export function createAgentStateStreamRoute(uhpClient: UhpClient) {
  const route = new Hono();
  const stats: SseStats = { clients: 0, opened: 0, sent: 0, lastSentAt: null };
  // Every published state gets an increasing SSE id, shared by all clients, so a gap in the ids a client
  // receives (in the browser's EventStream tab, or `bun run debug:sse`) means it missed an event.
  let seq = 0;
  const ids = new WeakMap<object, number>();
  const idFor = (event: object) => {
    let id = ids.get(event);
    if (id === undefined) ids.set(event, (id = ++seq));
    return id;
  };

  route.get("/", (c) => {
    // Bun closes a connection after 10 s without traffic. An SSE stream is quiet until the agent changes,
    // so lift the limit for this request (c.env is the Bun server when Bun serves the app).
    (c.env as { timeout?: (request: Request, seconds: number) => void } | undefined)?.timeout?.(c.req.raw, 0);

    return streamSSE(c, async (stream) => {
      const client = ++stats.opened;
      const openedAt = Date.now();
      stats.clients += 1;
      if (DEBUG_LOG) console.log(`[sse-debug] client ${client} connected (${stats.clients} open)`);

      const send = async (event: object) => {
        const id = idFor(event);
        stats.sent += 1;
        stats.lastSentAt = new Date().toISOString();
        if (DEBUG_LOG) console.log(`[sse-debug] -> client ${client} id=${id} ${JSON.stringify(event)}`);
        await stream.writeSSE({ event: "agent-state", id: String(id), data: JSON.stringify(event) });
      };

      const unsubscribe = uhpClient.onStateChange((event) => void send(event));
      stream.onAbort(() => {
        unsubscribe();
        stats.clients -= 1;
        if (DEBUG_LOG) console.log(`[sse-debug] client ${client} disconnected after ${((Date.now() - openedAt) / 1000).toFixed(1)}s (${stats.clients} open)`);
      });

      const current = uhpClient.current();
      if (current) await send(current);

      // Keep the connection open; events arrive only through the listener above.
      while (!stream.aborted) {
        await stream.sleep(PING_MS);
        await stream.writeSSE({ event: "ping", data: "" });
      }
    });
  });

  return { route, stats };
}
