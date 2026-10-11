import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { attempts, problems, sessionItems } from "../../db/schema";
import { gradeAttempt } from "../../grading/grade";
import { completeIfDone, creditFor, currentItem, findSession, itemsOf } from "../../sessions/session";
import type { AnswerBody } from "./schema";

export type AnswerOutcome =
  | { status: "graded"; correct: boolean; expected: string; detail: string | null; credit: number; hintsUsed: number }
  | { status: "invalid"; message: string }
  | { status: "not_found" | "ended" | "wrong_position" | "unsupported" };

export async function answerQuestion(sessionId: string, body: AnswerBody): Promise<AnswerOutcome> {
  const session = await findSession(sessionId);
  if (!session) return { status: "not_found" };
  if (session.endedAt) return { status: "ended" };
  const item = currentItem(session, await itemsOf(sessionId));
  if (!item) return { status: "ended" };
  if (item.position !== body.position) return { status: "wrong_position" };

  const [problem] = await db.select({ type: problems.type, answer: problems.answer }).from(problems).where(eq(problems.id, item.problemId));
  const result = await gradeAttempt(problem.type, problem.answer, body.answer);
  if (result.status !== "graded") return result;

  const hintsUsed = item.hintsRevealed;
  const credit = creditFor(result.correct, hintsUsed);
  const attemptId = crypto.randomUUID();
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(attempts)
      .values({
        id: attemptId,
        problemId: item.problemId,
        answerGiven: body.answer,
        correct: result.correct,
        secondsSpent: body.secondsSpent,
        toolsUsed: body.toolsUsed,
        agentStateAtStart: body.agentState,
        timestamp: now,
        sessionId,
        hintsUsed,
      })
      .run();
    tx.update(sessionItems)
      .set({ outcome: "answered", attemptId, credit, resolvedAt: now })
      .where(and(eq(sessionItems.sessionId, sessionId), eq(sessionItems.position, item.position)))
      .run();
  });
  await completeIfDone(sessionId);
  return { status: "graded", correct: result.correct, expected: result.expected, detail: result.detail ?? null, credit, hintsUsed };
}
