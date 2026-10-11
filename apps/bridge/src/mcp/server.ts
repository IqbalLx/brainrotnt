import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCoverage } from "../features/get-coverage/query";
import { getSchema } from "../features/get-schema/query";
import { listFlagged } from "../features/list-flagged/query";
import { listMissingExtras, MISSING_PAGE_MAX } from "../features/list-missing-extras/query";
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
        "Start here. Returns the JSON Schemas (problemSpec for STEM, triviaSpec for trivia, templateSpec), the allowed subjects, types and calculator tiers, and the limits. " +
        "A STEM problem must include a Python reference solution that the server runs to verify the answer key; trivia cites sources instead. " +
        "Any problem may carry up to three hints and an explanation, which are checked against the key.",
    },
    async () => text(getSchema()),
  );

  server.registerTool(
    "get_coverage",
    {
      description:
        "Counts per subject, topic and difficulty: verified, unverified (trivia with fewer than two sources), flagged, and live problems still missing hints or an explanation, so you can target gaps.",
    },
    async () => text(await getCoverage()),
  );

  server.registerTool(
    "submit_problems",
    {
      description:
        `Validate, verify and insert up to ${MAX_BATCH} items (shapes: see get_schema). An item is either a problem with a reference solution, ` +
        "which is run in a sandbox and must reproduce the stated answer, or a template (an object with a `template` key) whose seeded generator is " +
        "checked over 50 seeds and expanded into distinct computed variants, or a trivia question with its sources. Hints that contain the answer, and explanations whose " +
        "final Answer line disagrees with the key, are rejected. Items are handled independently: the result lists each item as inserted (with its id, plus " +
        "verification: unverified or review notes when they apply) or rejected (with its errors) so you can fix and resubmit only the rejected ones.",
      inputSchema: { problems: z.array(z.unknown()).min(1).max(MAX_BATCH).describe("Problem objects, each shaped as get_schema describes.") },
    },
    async ({ problems }) => text(await submitProblems(problems)),
  );

  server.registerTool(
    "list_flagged",
    {
      description:
        "Problems flagged as wrong or ambiguous (out of rotation), plus live problems with a review note such as a hint that may give a code solution away (inRotation: true), " +
        "with their statement, answer key, hints, explanation and the reasons. Repair each with update_problem.",
    },
    async () => text(await listFlagged()),
  );

  server.registerTool(
    "list_missing_extras",
    {
      description:
        "Live problems that still lack hints, an explanation, or either, with their statement, answer key and sources, so you can write them. " +
        "Backfill each through update_problem with the full problem plus the new hints and explanation (a STEM problem needs its reference solution written again; none is stored). " +
        "Work in small batches.",
      inputSchema: {
        missing: z.enum(["hints", "explanation", "either"]).default("either"),
        subject: z.enum(["math", "stats", "physics", "code", "trivia"]).optional(),
        limit: z.number().int().min(1).max(MISSING_PAGE_MAX).default(10),
      },
    },
    async (input) => text(await listMissingExtras(input)),
  );

  server.registerTool(
    "update_problem",
    {
      description:
        "Replace a problem after repair, or to add hints and an explanation. The full problem (with a reference solution, or sources for trivia) is verified again, " +
        "inserted as the next version, and the old version is retired. Open flags on it are resolved.",
      inputSchema: {
        id: z.string().describe("The id of the problem being replaced, as list_flagged or list_missing_extras returns it."),
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
