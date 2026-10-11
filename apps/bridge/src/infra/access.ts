import { timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "hono/bun";
import { getCookie, setCookie } from "hono/cookie";

export const KEY_COOKIE = "brainrotnt_key";
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

export interface NetworkAccess {
  /** Required from every device other than this computer; part of the printed network link. */
  key: string;
  /** Host names the app may be reached by: the machine's LAN addresses and any given with --host. */
  hosts: string[];
  /** Let other devices submit code answers, which run on this machine. Off by default. */
  allowRemoteCode: boolean;
  /** Peer address of a request; defaults to Bun's connection info. Overridable for tests. */
  peerAddress?: (c: Context) => string | undefined;
}

const isLoopback = (address: string | undefined) =>
  !!address && (address === "::1" || address.startsWith("127.") || address.startsWith("::ffff:127."));

const sameKey = (given: string | undefined, key: string) => {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
};

const hostnameOf = (value: string) => {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

/**
 * Network mode (`brnt --network`). The app binds every interface, so:
 * - It only answers to this machine's own names and LAN addresses, which also defeats DNS rebinding,
 *   and refuses requests whose Origin is anything else.
 * - This computer (a loopback peer) keeps full access, as in localhost mode.
 * - Any other device needs the access key: from the link once (`?key=`), which sets a cookie and
 *   redirects to drop the key from the address bar, then from the cookie.
 * - MCP (which writes problems) and the debug endpoints stay reachable from this computer only.
 * - Code answers and trial runs, which run on this machine, are refused from other devices unless allowed.
 */
export function networkAccess({ key, hosts, allowRemoteCode, peerAddress = (c) => getConnInfo(c).remote.address }: NetworkAccess): MiddlewareHandler {
  const allowed = new Set([...LOCAL_HOSTS, ...hosts]);
  return async (c, next) => {
    const url = new URL(c.req.url);
    if (!allowed.has(url.hostname)) return c.json({ error: "forbidden_host" }, 403);
    const origin = c.req.header("origin");
    if (origin && !allowed.has(hostnameOf(origin))) return c.json({ error: "forbidden_origin" }, 403);

    if (isLoopback(peerAddress(c))) return next();

    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/") || url.pathname.startsWith("/api/debug")) {
      return c.json({ error: "local_only", message: "This endpoint only answers the computer running brainrotnt." }, 403);
    }

    const fromLink = url.searchParams.get("key") ?? undefined;
    if (sameKey(fromLink, key)) {
      setCookie(c, KEY_COOKIE, key, { httpOnly: true, sameSite: "Strict", path: "/" });
      if (c.req.method === "GET") {
        url.searchParams.delete("key");
        return c.redirect(`${url.pathname}${url.search}${url.hash}`, 302);
      }
    } else if (!sameKey(getCookie(c, KEY_COOKIE), key)) {
      return url.pathname.startsWith("/api/")
        ? c.json({ error: "access_key_required" }, 401)
        : c.html(LOCKED_PAGE, 401);
    }

    if (!allowRemoteCode && c.req.method === "POST" && /^\/api\/(attempts|sessions\/[^/]+\/(answer|try))$/.test(url.pathname)) {
      const body = await c.req.json().catch(() => null);
      const answer = (body as { answer?: unknown } | null)?.answer;
      if (answer && typeof answer === "object" && "code" in answer) {
        return c.json(
          {
            error: "remote_code_disabled",
            message: "Code answers run on the computer hosting brainrotnt, so they are turned off for other devices. Answer this one on that computer, or restart it with brnt --network --allow-remote-code.",
          },
          403,
        );
      }
    }
    return next();
  };
}

const LOCKED_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>brainrotnt</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1d2430">
<h1 style="font-size:1.25rem">This brainrotnt needs its access link</h1>
<p>Open the <strong>Network</strong> link shown in the terminal where <code>brnt --network</code> is running (or scan its QR code). It includes a key; after the first visit this device remembers it.</p>
</body>`;
