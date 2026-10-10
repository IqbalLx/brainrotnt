import { z } from "zod";
import { mcqAnswer, numericAnswer } from "../db/answer";

const common = {
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{2,63}$/, "lowercase letters, digits and hyphens, 3 to 64 characters")
    .optional()
    .describe("Optional stable id. Generated from the subject, topic and statement when omitted."),
  subject: z.enum(["math", "stats", "physics"]).describe("The subject. Code problems are not supported yet."),
  topic: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9 -]{1,59}$/, "letters, digits, spaces and hyphens, 2 to 60 characters")
    .describe("A short topic within the subject, e.g. kinematics or derivatives."),
  difficulty: z.number().int().min(1).max(5).describe("1 (easiest) to 5 (hardest)."),
  statement: z
    .string()
    .trim()
    .min(10)
    .max(2000)
    .describe("Plain text. Original wording only: never copy text from a book."),
  tools: z
    .object({
      calculator: z.enum(["none", "basic", "scientific", "stats"]).default("none").describe("The most capable calculator this problem allows."),
      draw: z.boolean().default(false).describe("Whether the drawing board is allowed."),
    })
    .default({}),
  reference: z
    .object({
      code: z
        .string()
        .min(1)
        .max(20_000)
        .describe(
          "Python 3 that computes the answer from scratch (do not just print the key) and prints ONE JSON value on its last line: " +
            "a number for a numeric problem, or the integer index of the correct option for a multiple-choice one. " +
            "It runs in a sandbox with no network, 5 seconds and 512 MB.",
        ),
    })
    .describe("The reference solution. The server runs it and rejects the problem if it disagrees with the stated answer."),
  source: z.string().trim().max(200).optional().describe("A pointer to where the syllabus topic comes from, such as a chapter. Never copied text."),
};

export const problemSpec = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("mcq"), answer: mcqAnswer.describe("options (2 to 8 strings) and the 0-based index of the correct one.") }),
  z.object({
    ...common,
    type: z.literal("numeric"),
    answer: numericAnswer.describe("value, a relative tolerance (default 0.01; 0 means exact) and an optional unit such as m or J."),
  }),
]);

export type ProblemSpec = z.infer<typeof problemSpec>;

export function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.length ? issue.path.join(".") : "problem"}: ${issue.message}`);
}

// Things the schema cannot express.
export function semanticIssues(spec: ProblemSpec): string[] {
  if (spec.type !== "mcq") return [];
  const keys = spec.answer.options.map((option) => option.trim().toLowerCase());
  return new Set(keys).size === keys.length ? [] : ["answer.options: options must be distinct"];
}
