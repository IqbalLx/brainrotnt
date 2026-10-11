import type { Server } from "bun";

export interface ListenOptions {
  start: number;
  /** Only `start` will do (the person asked for that port): fail instead of moving on. */
  strict: boolean;
  hostname: string;
  fetch: (request: Request, server: Server<undefined>) => Response | Promise<Response>;
  tries?: number;
}

export class PortInUseError extends Error {
  constructor(readonly ports: [number, number]) {
    super(ports[0] === ports[1] ? `port ${ports[0]} is in use` : `ports ${ports[0]} to ${ports[1]} are all in use`);
  }
}

/**
 * Serves on `start`, or the next free port after it. A port counts as taken when anything already
 * accepts connections on it, not only when binding fails: on macOS a server bound to 0.0.0.0 does not
 * stop another from binding 127.0.0.1 on the same port, and that would quietly shadow it.
 */
export async function listenOnFreePort({ start, strict, hostname, fetch, tries = 20 }: ListenOptions): Promise<Server<undefined>> {
  const last = strict ? start : Math.min(start + tries - 1, 65535);
  for (let port = start; port <= last; port++) {
    if (await acceptsConnections(port)) continue;
    try {
      return Bun.serve({ port, hostname, fetch });
    } catch (error) {
      if ((error as { code?: string }).code === "EADDRINUSE" || /in use/i.test(String(error))) continue;
      throw error;
    }
  }
  throw new PortInUseError([start, last]);
}

export async function acceptsConnections(port: number, host = "127.0.0.1", timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    Bun.connect({
      hostname: host,
      port,
      socket: {
        open(socket) {
          clearTimeout(timer);
          socket.end();
          resolve(true);
        },
        data() {},
        connectError() {
          clearTimeout(timer);
          resolve(false);
        },
      },
    }).catch(() => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
