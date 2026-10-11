import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { KEY_COOKIE, networkAccess } from "./access";

const KEY = "k3y-for-tests-0123456789abcdef";
const LAN = "http://192.168.1.23:8787";

// The peer address comes from a test header, standing in for the socket's remote address.
function app(allowRemoteCode = false) {
  const app = new Hono();
  app.use("*", networkAccess({ key: KEY, hosts: ["192.168.1.23"], allowRemoteCode, peerAddress: (c) => c.req.header("x-test-peer") }));
  app.get("/", (c) => c.text("app"));
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.post("/mcp", (c) => c.json({ mcp: true }));
  app.get("/api/debug/agent-state", (c) => c.json({ debug: true }));
  app.post("/api/sessions/:id/answer", async (c) => c.json({ graded: await c.req.json() }));
  app.post("/api/sessions/:id/try", async (c) => c.json({ tried: await c.req.json() }));
  return app;
}
const remote = { "x-test-peer": "192.168.1.50" };
const cookie = { ...remote, cookie: `${KEY_COOKIE}=${KEY}` };

describe("networkAccess", () => {
  test("this computer keeps full access without a key", async () => {
    const local = { "x-test-peer": "127.0.0.1" };
    expect((await app().request("http://localhost:8787/", { headers: local })).status).toBe(200);
    expect((await app().request(`${LAN}/mcp`, { method: "POST", headers: local })).status).toBe(200);
    expect((await app().request(`${LAN}/`, { headers: { "x-test-peer": "::ffff:127.0.0.1" } })).status).toBe(200);
  });

  test("another device needs the key: the link sets a cookie and redirects without the key", async () => {
    expect((await app().request(`${LAN}/`, { headers: remote })).status).toBe(401);
    expect((await app().request(`${LAN}/api/health`, { headers: remote })).status).toBe(401);
    expect((await app().request(`${LAN}/?key=wrong`, { headers: remote })).status).toBe(401);

    const res = await app().request(`${LAN}/?key=${KEY}`, { headers: remote });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain(`${KEY_COOKIE}=${KEY}`);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");

    expect((await app().request(`${LAN}/`, { headers: cookie })).status).toBe(200);
    expect((await app().request(`${LAN}/api/health`, { headers: cookie })).status).toBe(200);
  });

  test("MCP and debug endpoints stay local even with the key", async () => {
    expect((await app().request(`${LAN}/mcp`, { method: "POST", headers: cookie })).status).toBe(403);
    expect((await app().request(`${LAN}/api/debug/agent-state`, { headers: cookie })).status).toBe(403);
  });

  test("unknown host names and foreign origins are refused, even from this computer", async () => {
    const local = { "x-test-peer": "127.0.0.1" };
    expect((await app().request("http://evil.example:8787/", { headers: local })).status).toBe(403);
    expect((await app().request(`${LAN}/`, { headers: { ...cookie, origin: "http://evil.example" } })).status).toBe(403);
    expect((await app().request(`${LAN}/`, { headers: { ...cookie, origin: LAN } })).status).toBe(200);
  });

  test("code answers from another device are refused unless allowed; other answers pass", async () => {
    const post = (allow: boolean, answer: unknown) =>
      app(allow).request(`${LAN}/api/sessions/s1/answer`, {
        method: "POST",
        headers: { ...cookie, "content-type": "application/json" },
        body: JSON.stringify({ position: 0, answer }),
      });
    const refused = await post(false, { language: "python", code: "def solve(): pass" });
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toBe("remote_code_disabled");
    expect((await post(true, { language: "python", code: "def solve(): pass" })).status).toBe(200);
    // The route can still read the body the guard already parsed.
    expect(await (await post(false, "42")).json()).toEqual({ graded: { position: 0, answer: "42" } });
  });

  test("trial runs of code from another device are refused unless allowed", async () => {
    const tryCode = (allow: boolean) =>
      app(allow).request(`${LAN}/api/sessions/s1/try`, {
        method: "POST",
        headers: { ...cookie, "content-type": "application/json" },
        body: JSON.stringify({ position: 0, answer: { language: "python", code: "def solve(): pass" } }),
      });
    expect((await tryCode(false)).status).toBe(403);
    expect((await tryCode(true)).status).toBe(200);
  });
});
