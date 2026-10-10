import { z } from "zod";

export const submitAttemptBody = z.object({
  problemId: z.string().min(1).max(128),
  answer: z.union([z.string().max(100), z.number()]),
  secondsSpent: z.number().min(0).max(86_400),
  agentState: z.enum(["idle", "working", "blocked", "done"]),
  toolsUsed: z.array(z.string().max(32)).max(8).default([]),
});

export type SubmitAttemptBody = z.infer<typeof submitAttemptBody>;
