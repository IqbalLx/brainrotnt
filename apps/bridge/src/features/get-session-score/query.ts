import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { attempts, problems, sessionItems } from "../../db/schema";
import type { SessionRow } from "../../sessions/session";

export interface SessionScore {
  id: string;
  endReason: SessionRow["endReason"];
  startedAt: string;
  endedAt: string;
  score: number;
  maxScore: number;
  answered: number;
  correct: number;
  subjects: string[];
  /** Time spent on answered questions, in seconds. */
  secondsSpent: number;
  hintsUsed: number;
  items: {
    position: number;
    problemId: string;
    subject: string;
    topic: string;
    statement: string;
    outcome: "answered" | "skipped" | "unanswered";
    correct: boolean | null;
    credit: number;
    hintsUsed: number;
    /** Unlocked for answered and skipped questions; a question left unanswered keeps it locked. */
    explanation: string | null;
    hasExplanation: boolean;
    type: string;
    secondsSpent: number | null;
    /** What the person submitted, for their own review. */
    answerGiven: unknown;
  }[];
}

export async function getSessionScore(session: SessionRow & { endedAt: Date }): Promise<SessionScore> {
  const rows = await db
    .select({
      position: sessionItems.position,
      problemId: sessionItems.problemId,
      outcome: sessionItems.outcome,
      credit: sessionItems.credit,
      hintsRevealed: sessionItems.hintsRevealed,
      subject: problems.subject,
      topic: problems.topic,
      statement: problems.statement,
      explanation: problems.explanation,
      correct: attempts.correct,
      type: problems.type,
      secondsSpent: attempts.secondsSpent,
      answerGiven: attempts.answerGiven,
    })
    .from(sessionItems)
    .innerJoin(problems, eq(problems.id, sessionItems.problemId))
    .leftJoin(attempts, eq(attempts.id, sessionItems.attemptId))
    .where(eq(sessionItems.sessionId, session.id))
    .orderBy(asc(sessionItems.position));

  const items = rows.map((row) => ({
    position: row.position,
    problemId: row.problemId,
    subject: row.subject,
    topic: row.topic,
    statement: row.statement,
    outcome: row.outcome ?? ("unanswered" as const),
    correct: row.outcome === "answered" ? row.correct : null,
    credit: row.credit ?? 0,
    hintsUsed: row.hintsRevealed,
    explanation: row.outcome === null ? null : row.explanation,
    hasExplanation: row.explanation !== null,
    type: row.type,
    secondsSpent: row.secondsSpent,
    answerGiven: row.answerGiven,
  }));
  return {
    id: session.id,
    endReason: session.endReason,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    score: items.reduce((sum, item) => sum + item.credit, 0),
    maxScore: items.length,
    answered: items.filter((item) => item.outcome === "answered").length,
    correct: items.filter((item) => item.correct === true).length,
    subjects: [...new Set(items.map((item) => item.subject))],
    secondsSpent: Math.round(items.reduce((sum, item) => sum + (item.secondsSpent ?? 0), 0) * 10) / 10,
    hintsUsed: items.reduce((sum, item) => sum + item.hintsUsed, 0),
    items,
  };
}
