import { z } from "zod";
import { mcqAnswer, numericAnswer } from "../db/answer";

const base = {
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
  tools: z
    .object({
      calculator: z.enum(["none", "basic", "scientific", "stats"]).default("none").describe("The most capable calculator this problem allows."),
      draw: z.boolean().default(false).describe("Whether the drawing board is allowed."),
    })
    .default({}),
  source: z.string().trim().max(200).optional().describe("A pointer to where the syllabus topic comes from, such as a chapter. Never copied text."),
};

const fixed = {
  statement: z
    .string()
    .trim()
    .min(10)
    .max(2000)
    .describe("Plain text. Original wording only: never copy text from a book."),
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
};

export const problemSpec = z.discriminatedUnion("type", [
  z.object({ ...base,
    ...fixed, type: z.literal("mcq"), answer: mcqAnswer.describe("options (2 to 8 strings) and the 0-based index of the correct one.") }),
  z.object({
    ...base,
    ...fixed,
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

// A parameterized problem: one seeded Python generator expanded into a fixed number of variants.
const template = z.object({
  statement: z
    .string()
    .trim()
    .min(10)
    .max(2000)
    .describe("Plain text with {name} placeholders, one per generated parameter, e.g. 'A ball is launched at {v} m/s...'."),
  generator: z
    .string()
    .min(1)
    .max(20_000)
    .describe(
      "Python 3 defining generate(seed) -> dict. Use random.Random(seed) so the same seed always gives the same result. " +
        "Return {'params': {name: number or string}, 'answer': <number>} for a numeric problem, or " +
        "{'params': {...}, 'options': [str, ...], 'correct': <index>} for a multiple-choice one. Round numbers you show. " +
        "The server checks seeds 0 to 49 for errors, non-determinism and unusable output before accepting it.",
    ),
  variants: z.number().int().min(1).max(50).default(10).describe("How many distinct problems to expand into the bank (1 to 50)."),
});

export const templateSpec = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("mcq"), template }),
  z.object({
    ...base,
    type: z.literal("numeric"),
    template,
    answer: z
      .object({
        tolerance: z.number().min(0).default(0.01).describe("Relative tolerance applied to every variant (0 means exact)."),
        unit: z.string().min(1).optional().describe("The unit shown beside every variant, such as m or J."),
      })
      .default({}),
  }),
]);

export type TemplateSpec = z.infer<typeof templateSpec>;

export const isTemplateItem = (raw: unknown): boolean => typeof raw === "object" && raw !== null && "template" in raw;
