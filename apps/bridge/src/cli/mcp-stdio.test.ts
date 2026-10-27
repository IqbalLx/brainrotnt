import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const home = mkdtempSync(join(tmpdir(), "brainrotnt-mcp-"));
let client: Client;

beforeAll(async () => {
  client = new Client({ name: "brainrotnt-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(import.meta.dir, "dev.ts"), "mcp"],
      env: { PATH: process.env.PATH ?? "", BRAINROTNT_HOME: home },
      stderr: "ignore",
    }),
  );
}, 20_000);

afterAll(async () => {
  await client.close();
  rmSync(home, { recursive: true, force: true });
});

describe("brnt mcp", () => {
  test("serves the tools over stdio on a database it creates", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("submit_problems");
    const result = await client.callTool({ name: "get_coverage", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toBeDefined();
  });
});
