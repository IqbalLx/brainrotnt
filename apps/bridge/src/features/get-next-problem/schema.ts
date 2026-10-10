import { z } from "zod";

export const getNextProblemQuery = z.object({
  subject: z.enum(["math", "stats", "physics", "code"]),
  minDifficulty: z.coerce.number().int().min(1).max(5).default(1),
  maxDifficulty: z.coerce.number().int().min(1).max(5).default(5),
});

export type GetNextProblemQuery = z.infer<typeof getNextProblemQuery>;
