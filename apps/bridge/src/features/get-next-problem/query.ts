import { and, between, eq, notInArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { toProblemView, type ProblemView } from "../../content/problem-view";
import { problems } from "../../db/schema";
import type { GetNextProblemQuery } from "./schema";

export async function getNextProblem(filters: GetNextProblemQuery): Promise<ProblemView | null> {
  const rows = await db
    .select({
      id: problems.id,
      subject: problems.subject,
      topic: problems.topic,
      difficulty: problems.difficulty,
      type: problems.type,
      statement: problems.statement,
      tools: problems.tools,
      answer: problems.answer,
    })
    .from(problems)
    .where(
      and(
        eq(problems.subject, filters.subject),
        eq(problems.verificationStatus, "verified"),
        between(problems.difficulty, filters.minDifficulty, filters.maxDifficulty),
        filters.exclude.length > 0 ? notInArray(problems.id, filters.exclude) : undefined,
      ),
    )
    .orderBy(sql`random()`)
    .limit(1);

  const row = rows[0];
  return row ? toProblemView(row) : null;
}
