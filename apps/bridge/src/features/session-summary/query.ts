import { count, gte, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { attempts, problems } from "../../db/schema";

export interface SessionSummary {
  attempts: number;
  correct: number;
  accuracyPercent: number | null;
  bySubject: { subject: string; attempts: number; correct: number }[];
}

export async function getSessionSummary(since: Date): Promise<SessionSummary> {
  const rows = await db
    .select({
      subject: problems.subject,
      attempts: count(),
      correct: sql<number>`coalesce(sum(${attempts.correct}), 0)`.mapWith(Number),
    })
    .from(attempts)
    .innerJoin(problems, sql`${attempts.problemId} = ${problems.id}`)
    .where(gte(attempts.timestamp, since))
    .groupBy(problems.subject)
    .orderBy(problems.subject);

  const total = rows.reduce((sum, row) => sum + row.attempts, 0);
  const correct = rows.reduce((sum, row) => sum + row.correct, 0);
  return {
    attempts: total,
    correct,
    // Counts are exact; only the percentage is rounded.
    accuracyPercent: total === 0 ? null : Math.round((correct / total) * 100),
    bySubject: rows,
  };
}
