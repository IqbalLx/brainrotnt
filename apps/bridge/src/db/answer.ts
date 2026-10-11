import { VARIABLE_PATTERN } from "@brainrotnt/math-engine";
import { z } from "zod";

export const GRADABLE_TYPES = ["mcq", "numeric", "symbolic"] as const;

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

export type McqAnswer = z.infer<typeof mcqAnswer>;
export type NumericAnswer = z.infer<typeof numericAnswer>;
export type SymbolicAnswer = z.infer<typeof symbolicAnswer>;
