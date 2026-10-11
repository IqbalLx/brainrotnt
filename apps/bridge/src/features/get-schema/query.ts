import { zodToJsonSchema } from "zod-to-json-schema";
import { problemSpec, templateSpec, triviaSpec } from "../../content/problem-spec";
import { MAX_BATCH } from "../submit-problems/command";

export function getSchema() {
  return {
    problemSpec: zodToJsonSchema(problemSpec, { $refStrategy: "none" }),
    templateSpec: zodToJsonSchema(templateSpec, { $refStrategy: "none" }),
    triviaSpec: zodToJsonSchema(triviaSpec, { $refStrategy: "none" }),
    supported: {
      subjects: ["math", "stats", "physics", "code", "trivia"],
      types: ["mcq", "numeric", "symbolic", "code"],
      calculatorTiers: ["none", "basic", "scientific", "stats"],
      difficulty: "1 to 5",
    },
    limits: { maxProblemsPerSubmit: MAX_BATCH, referenceSolution: "5 s, 512 MB, no network, 64 KB of output" },
    notes: [
      "A problem is accepted only if its reference solution runs in the sandbox and agrees with the stated answer.",
      "Duplicates (same statement and topic) are rejected.",
      "For quantitative topics, prefer one template over many hand-written problems: submit an item shaped as templateSpec (an object with a `template` key) and the server expands it into distinct, computed variants. A template is accepted whole or not at all.",
      "Programming problems (type code, subject code) are tested by running student code against your tests: give a starter, a correct reference and a deliberately wrong solution per language, with visible example tests and hidden ones. Each offered language is verified in the sandbox: the reference must pass every test, the wrong one must fail at least one.",
      "Trivia (subject trivia, type mcq or numeric) is shaped as triviaSpec: no reference solution, but sources, each a URL with the exact sentence that states the fact. Two or more sources on different sites make it verified; with one it is stored unverified and shown with a badge. Ask only stable facts: wording such as current, today or latest is rejected unless the statement pins a year.",
      "Write original statements; store source pointers, not copied text.",
      "Submit in moderate batches per topic: generation counts against your plan's usage limits.",
    ],
  };
}
