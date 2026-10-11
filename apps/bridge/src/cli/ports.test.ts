import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { listenOnFreePort, PortInUseError } from "./ports";

const servers: Server<undefined>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});
const fetch = () => new Response("ok");

// Takes a free port from the OS, so tests do not collide with anything already running.
function occupy(hostname = "127.0.0.1") {
  const server = Bun.serve({ port: 0, hostname, fetch });
  servers.push(server);
  return server.port!;
}

describe("listenOnFreePort", () => {
  test("uses the requested port when it is free", async () => {
    const port = occupy();
    servers.pop()!.stop(true);
    const server = await listenOnFreePort({ start: port, strict: false, hostname: "127.0.0.1", fetch });
    servers.push(server);
    expect(server.port).toBe(port);
  });

  test("moves past a port something else is serving, even on another address", async () => {
    const taken = occupy("0.0.0.0");
    const server = await listenOnFreePort({ start: taken, strict: false, hostname: "127.0.0.1", fetch });
    servers.push(server);
    expect(server.port).toBeGreaterThan(taken);
    expect(await (await globalThis.fetch(`http://127.0.0.1:${taken}/`)).text()).toBe("ok");
  });

  test("a port asked for explicitly is used or the start fails", async () => {
    const taken = occupy();
    expect(listenOnFreePort({ start: taken, strict: true, hostname: "127.0.0.1", fetch })).rejects.toBeInstanceOf(PortInUseError);
  });
});
