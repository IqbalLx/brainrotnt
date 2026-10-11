import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { attempts, problems } from "../../db/schema";
import type { SubmitAttemptBody } from "./schema";

export async function findProblemForGrading(id: string) {
  const rows = await db
    .select({ type: problems.type, answer: problems.answer, difficulty: problems.difficulty })
    .from(problems)
    .where(eq(problems.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function recordAttempt(body: SubmitAttemptBody, correct: boolean): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(attempts).values({
    id,
    problemId: body.problemId,
    answerGiven: body.answer,
    correct,
    secondsSpent: body.secondsSpent,
    toolsUsed: body.toolsUsed,
    agentStateAtStart: body.agentState,
    timestamp: new Date(),
  });
  return id;
}
