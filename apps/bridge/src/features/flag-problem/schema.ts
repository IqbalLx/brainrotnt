import { z } from "zod";

export const flagProblemBody = z.object({
  problemId: z.string().min(1).max(128),
  reason: z.string().trim().min(1).max(500).default("wrong_or_ambiguous"),
});

export type FlagProblemBody = z.infer<typeof flagProblemBody>;
