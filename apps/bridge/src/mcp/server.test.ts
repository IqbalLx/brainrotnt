import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Hono } from "hono";
import { localOnly } from "../infra/local-only";
import { flagProblem } from "../features/flag-problem/query";
import { numericSpec, resetDb } from "../test-support";
import { mcpRoute } from "./route";

const app = new Hono();
app.use("*", localOnly);
app.route("/mcp", mcpRoute);

let server: ReturnType<typeof Bun.serve>;
let client: Client;

beforeAll(async () => {
  server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch });
  client = new Client({ name: "brainrotnt-test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.port}/mcp`)));
});

afterAll(async () => {
  await client.close();
  await server.stop(true);
});

beforeEach(resetDb);

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return { isError: Boolean(result.isError), body: JSON.parse(content[0].text) as any };
}

describe("MCP endpoint", () => {
  test("lists the five pipeline tools with descriptions", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_coverage", "get_schema", "list_flagged", "submit_problems", "update_problem"]);
    for (const tool of tools) expect(tool.description?.length).toBeGreaterThan(20);
  });

  test("get_schema returns the problem schema", async () => {
    const { body } = await call("get_schema");
    expect(body.supported.types).toEqual(["mcq", "numeric", "symbolic", "code"]);
    expect(JSON.stringify(body.problemSpec)).toContain("reference");
  });

  test("the whole loop: submit, cover, flag, list, repair", async () => {
    const submitted = await call("submit_problems", {
      problems: [numericSpec({ statement: "What is 6 times 7? Give a whole number." }), { subject: "math" }],
    });
    expect(submitted.isError).toBe(false);
    expect(submitted.body).toMatchObject({ submitted: 2, inserted: 1, rejected: 1 });
    const id = submitted.body.results[0].id as string;
    expect(submitted.body.results[1].errors.length).toBeGreaterThan(0);

    const coverage = await call("get_coverage");
    expect(coverage.body).toMatchObject({ total: 1, rows: [{ subject: "math", topic: "arithmetic", difficulty: 1, verified: 1, flagged: 0 }] });

    expect((await call("list_flagged")).body).toEqual([]);
    flagProblem({ problemId: id, reason: "unclear whether to round" });
    const flagged = (await call("list_flagged")).body;
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ id, flags: [{ reason: "unclear whether to round" }], answer: { value: 42 } });

    const repaired = await call("update_problem", { id, problem: numericSpec({ statement: "What is 6 times 7? Answer with a whole number only." }) });
    expect(repaired.isError).toBe(false);
    expect(repaired.body).toMatchObject({ ok: true, id: `${id}.v2`, version: 2, retired: id });
    expect((await call("list_flagged")).body).toEqual([]);
    expect((await call("get_coverage")).body.total).toBe(1);
  });

  test("a template submitted over MCP expands into computed variants", async () => {
    const generator = "import random\ndef generate(seed):\n    v = random.Random(seed).randint(2, 40)\n    return {'params': {'v': v}, 'answer': v * v}";
    const { body, isError } = await call("submit_problems", {
      problems: [{ subject: "math", topic: "squares", difficulty: 1, type: "numeric", template: { statement: "What is {v} squared? Give a whole number.", generator, variants: 8 }, answer: { tolerance: 0 } }],
    });
    expect(isError).toBe(false);
    expect(body).toMatchObject({ inserted: 1, problemsAdded: 8 });
    expect(body.results[0].ids).toHaveLength(8);
    expect((await call("get_coverage")).body).toMatchObject({ total: 8, rows: [{ topic: "squares", verified: 8 }] });
  });

  test("a failed repair is reported as a tool error with the reason", async () => {
    const missing = await call("update_problem", { id: "nope", problem: numericSpec() });
    expect(missing.isError).toBe(true);
    expect(missing.body.errors[0]).toContain("not found");
  });

  test("a wrong key comes back as a rejected item, not a protocol error", async () => {
    const { body, isError } = await call("submit_problems", { problems: [numericSpec({ answer: { value: 1, tolerance: 0 } })] });
    expect(isError).toBe(false);
    expect(body.results[0].errors[0]).toContain("reference solution computed 42");
  });

  test("an oversized batch is refused by the tool's own input schema", async () => {
    const result = await client.callTool({ name: "submit_problems", arguments: { problems: Array.from({ length: 26 }, () => ({})) } }).catch((e) => e);
    expect(result instanceof Error || (result as any).isError).toBe(true);
  });

  test("requests for a foreign hostname never reach the tools", async () => {
    const res = await app.request("http://evil.example/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
    expect(res.status).toBe(403);
  });
});
