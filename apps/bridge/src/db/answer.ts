import { z } from "zod";

export const GRADABLE_TYPES = ["mcq", "numeric"] as const;

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

export type McqAnswer = z.infer<typeof mcqAnswer>;
export type NumericAnswer = z.infer<typeof numericAnswer>;
