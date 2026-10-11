import { z } from "zod";
import { CODE_LANGUAGES } from "../../db/answer";

export const submitAttemptBody = z.object({
  problemId: z.string().min(1).max(128),
  answer: z.union([
    z.string().max(200),
    z.number(),
    z.object({ language: z.enum(CODE_LANGUAGES), code: z.string().max(20_000) }),
  ]),
  secondsSpent: z.number().min(0).max(86_400),
  agentState: z.enum(["idle", "working", "blocked", "done"]),
  toolsUsed: z.array(z.string().max(32)).max(8).default([]),
});

export type SubmitAttemptBody = z.infer<typeof submitAttemptBody>;
