import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { UhpClient } from "../../infra/uhp-client";

export function createAgentStateStreamRoute(uhpClient: UhpClient) {
  const route = new Hono();

  route.get("/", (c) => {
    return streamSSE(c, async (stream) => {
      const send = (event: unknown) =>
        stream.writeSSE({ event: "agent-state", data: JSON.stringify(event) });

      const unsubscribe = uhpClient.onStateChange((event) => void send(event));
      stream.onAbort(() => unsubscribe());

      const current = uhpClient.current();
      if (current) await send(current);

      // Keep the connection open; events arrive only through the listener above.
      while (true) {
        await stream.sleep(30_000);
        await stream.writeSSE({ event: "ping", data: "" });
      }
    });
  });

  return route;
}
