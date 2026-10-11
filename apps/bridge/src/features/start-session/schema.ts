import { z } from "zod";
import { SESSION_SUBJECTS } from "../../sessions/session";

export const MAX_SESSION_SIZE = 20;

export const startSessionBody = z
  .object({
    subjects: z.array(z.enum(SESSION_SUBJECTS)).min(1).max(SESSION_SUBJECTS.length),
    minDifficulty: z.number().int().min(1).max(5).default(1),
    maxDifficulty: z.number().int().min(1).max(5).default(5),
    size: z.number().int().min(1).max(MAX_SESSION_SIZE).default(5),
    startedBy: z.enum(["agent", "manual"]).default("manual"),
  })
  .refine((b) => b.minDifficulty <= b.maxDifficulty, { message: "minDifficulty must not exceed maxDifficulty" });

export type StartSessionBody = z.infer<typeof startSessionBody>;
