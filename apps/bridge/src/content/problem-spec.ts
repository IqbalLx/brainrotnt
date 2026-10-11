import { z } from "zod";
import { codeAnswer, codeTest, mcqAnswer, numericAnswer, symbolicAnswer } from "../db/answer";
import { ENTRY_PATTERN } from "../infra/code-runner";
import { explanationSpec } from "./explanation";
import { hintsSpec } from "./hints";

const common = {
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{2,63}$/, "lowercase letters, digits and hyphens, 3 to 64 characters")
    .optional()
    .describe("Optional stable id. Generated from the subject, topic and statement when omitted."),
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
  hints: hintsSpec,
  explanation: explanationSpec,
};

const base = { ...common, subject: z.enum(["math", "stats", "physics"]).describe("The subject. Programming problems use type code instead.") };

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
            "a number for a numeric problem, the integer index of the correct option for a multiple-choice one, or for a symbolic one " +
            '{"points": [{"vars": {"x": 1.5}, "value": 12.25}, ...]} with at least 6 points, each computed independently of the key ' +
            "(for example by numerical differentiation or direct evaluation) and accurate to about 1e-5. " +
            "It runs in a sandbox with no network, 5 seconds and 512 MB.",
        ),
    })
    .describe("The reference solution. The server runs it and rejects the problem if it disagrees with the stated answer."),
};

const codeLanguageSpec = z.object({
  starter: z
    .string()
    .max(5000)
    .describe("The code the student starts from: the function signature with a TODO body that does NOT already solve the problem."),
  reference: z.string().min(1).max(20_000).describe("A correct solution defining the entry function. It must pass every test."),
  wrong: z
    .string()
    .min(1)
    .max(20_000)
    .describe("A plausible but WRONG solution (for example an off-by-one). The tests must catch it, which proves they are strong enough."),
});

const codeSpec = z.object({
  ...common,
  subject: z.literal("code"),
  type: z.literal("code"),
  statement: fixed.statement.describe(
    "Plain text. State exactly what the function receives and must return (JSON values only: numbers, strings, booleans, null, arrays, objects) " +
      "and show the visible tests as examples. Original wording only.",
  ),
  answer: z.object({
    entry: z.string().regex(ENTRY_PATTERN, "a function name: letters, digits and underscores").default("solve").describe("The function name the student must define."),
    tests: z
      .array(codeTest)
      .min(4)
      .max(50)
      .describe("Calls as {args: [...], expected: <JSON>, hidden?: boolean}. Include at least 1 visible example and at least 2 hidden tests, with edge cases among the hidden ones."),
  }),
  languages: z
    .object({ python: codeLanguageSpec.optional(), javascript: codeLanguageSpec.optional() })
    .describe("The languages offered. Every offered language is verified: its reference must pass all tests and its wrong solution must fail at least one."),
});

export type CodeSpec = z.infer<typeof codeSpec>;

/** What is stored: the key and the reference solutions, but not the deliberately wrong ones. */
export function storedAnswer(spec: ProblemSpec): unknown {
  if (spec.type !== "code") return spec.answer;
  const languages = Object.fromEntries(
    Object.entries(spec.languages)
      .filter(([, lang]) => lang !== undefined)
      .map(([name, lang]) => [name, { starter: lang!.starter, solution: lang!.reference }]),
  );
  return codeAnswer.parse({ entry: spec.answer.entry, tests: spec.answer.tests, languages });
}

export const problemSpec = z.discriminatedUnion("type", [
  codeSpec,
  z.object({ ...base,
    ...fixed, type: z.literal("mcq"), answer: mcqAnswer.describe("options (2 to 8 strings) and the 0-based index of the correct one.") }),
  z.object({
    ...base,
    ...fixed,
    type: z.literal("symbolic"),
    answer: symbolicAnswer.describe(
      "expression (the key, in calculator syntax such as 3*x^2+2), variables (1 to 3 single letters other than e and i) and an optional domain [low, high] (default [-5, 5]). " +
        "Any expression equivalent to the key is accepted, so the key only needs to be correct, not the only correct form.",
    ),
  }),
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
  if (spec.type === "code") {
    const issues: string[] = [];
    if (!Object.values(spec.languages).some(Boolean)) issues.push("languages: offer at least one language");
    if (!spec.answer.tests.some((t) => !t.hidden)) issues.push("answer.tests: at least one test must be visible, as an example");
    if (spec.answer.tests.filter((t) => t.hidden).length < 2) issues.push("answer.tests: at least two tests must be hidden, so a hard-coded answer fails");
    return issues;
  }
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
    .describe("Plain text with {name} placeholders, one per generated parameter, e.g. 'A ball is launched at {v} m/s...'. Top-level hints and the explanation may use the same placeholders, and the explanation may also use {answer} for each variant's answer (the number, or the correct option's text)."),
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
