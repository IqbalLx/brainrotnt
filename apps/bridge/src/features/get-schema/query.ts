import { zodToJsonSchema } from "zod-to-json-schema";
import { problemSpec } from "../../content/problem-spec";
import { MAX_BATCH } from "../submit-problems/command";

export function getSchema() {
  return {
    problemSpec: zodToJsonSchema(problemSpec, { $refStrategy: "none" }),
    supported: {
      subjects: ["math", "stats", "physics"],
      types: ["mcq", "numeric"],
      calculatorTiers: ["none", "basic", "scientific", "stats"],
      difficulty: "1 to 5",
    },
    limits: { maxProblemsPerSubmit: MAX_BATCH, referenceSolution: "5 s, 512 MB, no network, 64 KB of output" },
    notes: [
      "A problem is accepted only if its reference solution runs in the sandbox and agrees with the stated answer.",
      "Duplicates (same statement and topic) are rejected.",
      "Write original statements; store source pointers, not copied text.",
      "Submit in moderate batches per topic: generation counts against your plan's usage limits.",
    ],
  };
}
