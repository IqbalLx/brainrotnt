import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCoverage } from "../features/get-coverage/query";
import { getSchema } from "../features/get-schema/query";
import { listFlagged } from "../features/list-flagged/query";
import { MAX_BATCH, submitProblems } from "../features/submit-problems/command";
import { updateProblem } from "../features/update-problem/command";

const text = (value: unknown, isError = false) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

// The same slice commands the rest of the bridge uses, offered to Claude Code as MCP tools.
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "brainrotnt", version: "0.1.0" });

  server.registerTool(
    "get_schema",
    {
      description:
        "Start here. Returns the JSON Schema for a problem, the allowed subjects, types and calculator tiers, and the limits. " +
        "A problem must include a Python reference solution that the server runs to verify the answer key.",
    },
    async () => text(getSchema()),
  );

  server.registerTool(
    "get_coverage",
    { description: "Counts of verified and flagged problems per subject, topic and difficulty, so you can target gaps." },
    async () => text(await getCoverage()),
  );

  server.registerTool(
    "submit_problems",
    {
      description:
        `Validate, verify and insert up to ${MAX_BATCH} items (shapes: see get_schema). An item is either a problem with a reference solution, ` +
        "which is run in a sandbox and must reproduce the stated answer, or a template (an object with a `template` key) whose seeded generator is " +
        "checked over 50 seeds and expanded into distinct computed variants. Items are handled independently: the result lists each item as inserted (with its id) or rejected " +
        "(with its errors) so you can fix and resubmit only the rejected ones.",
      inputSchema: { problems: z.array(z.unknown()).min(1).max(MAX_BATCH).describe("Problem objects, each shaped as get_schema describes.") },
    },
    async ({ problems }) => text(await submitProblems(problems)),
  );

  server.registerTool(
    "list_flagged",
    {
      description:
        "Problems you flagged as wrong or ambiguous, with their current statement, answer key and the reasons given. Repair each with update_problem.",
    },
    async () => text(await listFlagged()),
  );

  server.registerTool(
    "update_problem",
    {
      description:
        "Replace a problem after repair. The corrected problem (full shape, with a reference solution) is verified again, inserted as the next " +
        "version, and the old version is retired. Open flags on it are resolved.",
      inputSchema: {
        id: z.string().describe("The id of the problem being replaced, as list_flagged returns it."),
        problem: z.unknown().describe("The full corrected problem, shaped as get_schema describes."),
      },
    },
    async ({ id, problem }) => {
      const result = await updateProblem(id, problem);
      return text(result, !result.ok);
    },
  );

  return server;
}
