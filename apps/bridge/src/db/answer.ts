import { VARIABLE_PATTERN } from "@brainrotnt/math-engine";
import { z } from "zod";
import { ENTRY_PATTERN } from "../infra/code-runner";

export const CODE_LANGUAGES = ["python", "javascript"] as const;

export const mcqAnswer = z
  .object({
    options: z.array(z.string().min(1)).min(2).max(8),
    correct: z.number().int().min(0),
  })
  .refine((a) => a.correct < a.options.length, { message: "correct must index into options" });

// tolerance is relative to value, except when value is 0, where it is absolute.
export const numericAnswer = z.object({
  value: z.number().finite(),
  tolerance: z.number().min(0).default(0.01),
  unit: z.string().min(1).optional(),
});

// The key is an expression in the calculator's syntax. A student's answer is accepted if it agrees with
// the key at sample points of the domain, so any equivalent form is correct.
export const symbolicAnswer = z
  .object({
    expression: z.string().trim().min(1).max(200),
    variables: z.array(z.string().regex(VARIABLE_PATTERN, "a single lowercase letter other than e and i")).min(1).max(3),
    domain: z.tuple([z.number().finite(), z.number().finite()]).default([-5, 5]),
  })
  .refine((a) => new Set(a.variables).size === a.variables.length, { message: "variables must be distinct" })
  .refine((a) => a.domain[0] < a.domain[1], { message: "domain must be [low, high] with low < high" });

function isJson(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJson(item, depth + 1));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.values(value as object).every((item) => isJson(item, depth + 1));
  }
  return false;
}

// Tests are plain JSON so the same test can drive any language. (A custom check rather than a recursive
// schema, which would not survive conversion to the JSON Schema that get_schema serves.)
const jsonValue = z.custom<unknown>((value) => isJson(value), "must be a plain JSON value");

export const codeTest = z.object({
  args: z.array(jsonValue).max(10),
  expected: jsonValue,
  hidden: z.boolean().default(false),
});

const codeLanguage = z.object({ starter: z.string().max(5000), solution: z.string().min(1).max(20_000) });

// The function to implement is called `entry` with each test's args. Hidden tests are never sent to the
// browser; the visible ones double as the examples shown with the problem.
export const codeAnswer = z
  .object({
    entry: z.string().regex(ENTRY_PATTERN, "a function name: letters, digits and underscores").default("solve"),
    tests: z.array(codeTest).min(4).max(50),
    languages: z
      .object({ python: codeLanguage.optional(), javascript: codeLanguage.optional() })
      .refine((l) => Object.values(l).some(Boolean), { message: "offer at least one language" }),
  })
  .refine((a) => a.tests.some((t) => !t.hidden), { message: "at least one test must be visible, as an example" })
  .refine((a) => a.tests.filter((t) => t.hidden).length >= 2, { message: "at least two tests must be hidden, so a hard-coded answer fails" });

export type McqAnswer = z.infer<typeof mcqAnswer>;
export type NumericAnswer = z.infer<typeof numericAnswer>;
export type SymbolicAnswer = z.infer<typeof symbolicAnswer>;
export type CodeAnswer = z.infer<typeof codeAnswer>;
