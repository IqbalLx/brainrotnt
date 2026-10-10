import { z } from "zod";

export const getNextProblemQuery = z.object({
  subject: z.enum(["math", "stats", "physics", "code"]),
  minDifficulty: z.coerce.number().int().min(1).max(5).default(1),
  maxDifficulty: z.coerce.number().int().min(1).max(5).default(5),
  exclude: z
    .string()
    .max(4096)
    .optional()
    .transform((value) => (value ? value.split(",").filter(Boolean).slice(0, 200) : [])),
});

export type GetNextProblemQuery = z.infer<typeof getNextProblemQuery>;
