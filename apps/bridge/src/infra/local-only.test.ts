import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { localOnly } from "./local-only";

const app = new Hono();
app.use("*", localOnly);
app.all("/ping", (c) => c.json({ ok: true }));

const status = async (url: string, headers: Record<string, string> = {}, method = "GET") => (await app.request(url, { method, headers })).status;

describe("localOnly", () => {
  test("allows loopback hosts", async () => {
    expect(await status("http://localhost/ping")).toBe(200);
    expect(await status("http://localhost:5173/ping")).toBe(200);
    expect(await status("http://127.0.0.1:8787/ping")).toBe(200);
    expect(await status("http://[::1]:8787/ping")).toBe(200);
  });

  test("refuses any other hostname, which is what DNS rebinding looks like", async () => {
    expect(await status("http://evil.example/ping")).toBe(403);
    expect(await status("http://localhost.evil.example/ping")).toBe(403);
    expect(await status("http://192.168.1.20:8787/ping")).toBe(403);
    expect(await status("http://0.0.0.0:8787/ping")).toBe(403);
  });

  test("refuses a foreign or malformed Origin even on a loopback host", async () => {
    expect(await status("http://127.0.0.1/ping", { origin: "https://evil.example" }, "POST")).toBe(403);
    expect(await status("http://127.0.0.1/ping", { origin: "null" }, "POST")).toBe(403);
    expect(await status("http://127.0.0.1/ping", { origin: "http://localhost:5173" }, "POST")).toBe(200);
    expect(await status("http://127.0.0.1/ping", { origin: "http://127.0.0.1:5173" }, "POST")).toBe(200);
  });

  test("reports why", async () => {
    const res = await app.request("http://evil.example/ping");
    expect(await res.json()).toEqual({ error: "forbidden_host" });
  });
});
