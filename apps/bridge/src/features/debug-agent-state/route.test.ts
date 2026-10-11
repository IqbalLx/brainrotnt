import { describe, expect, test } from "bun:test";
import { createUhpClient } from "../../infra/uhp-client";
import { createAgentStateStreamRoute } from "../agent-state-stream/route";
import { json, postJson } from "../../test-support";
import { createDebugAgentStateRoute } from "./route";

// Without a socket path this is the mock client; it is never started, so only injected states appear.
// Clear both, since a shell inside a Luvus pane sets LUVUS_SOCKET_PATH.
delete process.env.UHP_SOCKET_PATH;
delete process.env.LUVUS_SOCKET_PATH;

const setup = () => {
  const uhp = createUhpClient();
  const stream = createAgentStateStreamRoute(uhp);
  return { uhp, stream, debug: createDebugAgentStateRoute(uhp, stream.stats) };
};

async function readEvents(res: Response, count: number): Promise<{ id: string; data: any }[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: { id: string; data: any }[] = [];
  let buffer = "";
  while (events.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const fields = Object.fromEntries(
        buffer.slice(0, end).split("\n").map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]),
      );
      buffer = buffer.slice(end + 2);
      if (fields.event === "agent-state") events.push({ id: fields.id, data: JSON.parse(fields.data) });
    }
  }
  await reader.cancel();
  return events;
}

describe("/api/debug/agent-state", () => {
  test("POST publishes a state and GET reports it with the injection in recent frames", async () => {
    const { debug } = setup();
    const res = await debug.request("/", postJson({ status: "blocked", pane: "7" }));
    expect(res.status).toBe(200);

    const snapshot = await json(await debug.request("/?frames=10"));
    expect(snapshot.mode).toBe("mock");
    expect(snapshot.current.status).toBe("blocked");
    expect(snapshot.current.pane).toBe("7");
    expect(snapshot.recent.at(-1).outcome).toContain("injected");
    expect(snapshot.sse.clients).toBe(0);

    expect((await json(await debug.request("/?frames=0"))).recent).toEqual([]);
  });

  test("POST rejects an unknown status", async () => {
    const { debug } = setup();
    const res = await debug.request("/", postJson({ status: "sleeping" }));
    expect(res.status).toBe(400);
  });

  test("an injected state reaches an open SSE stream with consecutive ids", async () => {
    const { uhp, stream } = setup();
    uhp.inject({ status: "working", pane: "1", agent: "a", project: "p", cwd: "", branch: null });

    const res = await stream.route.request("/");
    const pending = readEvents(res, 2);
    // Let the stream send the current state and register its listener before publishing.
    await Bun.sleep(20);
    uhp.inject({ status: "done", pane: "1", agent: "a", project: "p", cwd: "", branch: null });

    const events = await pending;
    expect(events.map((e) => e.data.status)).toEqual(["working", "done"]);
    expect(Number(events[1].id)).toBe(Number(events[0].id) + 1);
  });
});
