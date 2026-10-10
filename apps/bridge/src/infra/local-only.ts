import type { MiddlewareHandler } from "hono";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// The bridge binds to loopback, but a web page open in your browser can still reach it, and a
// DNS-rebinding attack makes a hostile hostname resolve to 127.0.0.1. Requests whose Host or
// Origin is not a local one are refused, which matters most for the endpoints that write problems.
export const localOnly: MiddlewareHandler = async (c, next) => {
  const host = new URL(c.req.url).hostname;
  if (!LOCAL_HOSTS.has(host)) return c.json({ error: "forbidden_host" }, 403);

  const origin = c.req.header("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).hostname;
    } catch {
      // an unparseable origin is refused below
    }
    if (!LOCAL_HOSTS.has(originHost)) return c.json({ error: "forbidden_origin" }, 403);
  }
  await next();
};
