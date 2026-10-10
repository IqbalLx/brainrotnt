import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { UhpClient } from "../../infra/uhp-client";

export function createAgentStateStreamRoute(uhpClient: UhpClient) {
  const route = new Hono();

  route.get("/", (c) => {
    return streamSSE(c, async (stream) => {
      const unsubscribe = uhpClient.onStateChange(async (event) => {
        await stream.writeSSE({
          event: "agent-state",
          data: JSON.stringify(event),
        });
      });

      stream.onAbort(() => unsubscribe());

      // Keep the connection open; events arrive only through the listener above.
      while (true) {
        await stream.sleep(30_000);
        await stream.writeSSE({ event: "ping", data: "" });
      }
    });
  });

  return route;
}
