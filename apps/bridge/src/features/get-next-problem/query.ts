import { and, between, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { GRADABLE_TYPES, mcqAnswer, numericAnswer } from "../../db/answer";
import { problems } from "../../db/schema";
import type { GetNextProblemQuery } from "./schema";

export interface ProblemView {
  id: string;
  subject: string;
  topic: string;
  difficulty: number;
  type: string;
  statement: string;
  tools: unknown;
  choices: string[] | null;
  unit: string | null;
}

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
        inArray(problems.type, [...GRADABLE_TYPES]),
        between(problems.difficulty, filters.minDifficulty, filters.maxDifficulty),
        filters.exclude.length > 0 ? notInArray(problems.id, filters.exclude) : undefined,
      ),
    )
    .orderBy(sql`random()`)
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  // The answer key stays on the server; only what the UI needs to render is exposed.
  const { answer, ...rest } = row;
  return {
    ...rest,
    choices: row.type === "mcq" ? mcqAnswer.parse(answer).options : null,
    unit: row.type === "numeric" ? (numericAnswer.parse(answer).unit ?? null) : null,
  };
}
