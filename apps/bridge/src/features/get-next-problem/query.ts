import { and, between, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
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
}

const FALLBACK_PROBLEM: ProblemView = {
  id: "fallback-arith-001",
  subject: "math",
  topic: "arithmetic",
  difficulty: 1,
  type: "numeric",
  statement: "A 2 minute exercise while your agent works: what is 17 × 24?",
  tools: { calculator: "none", draw: false },
};

export async function getNextProblem(filters: GetNextProblemQuery): Promise<ProblemView> {
  const rows = await db
    .select({
      id: problems.id,
      subject: problems.subject,
      topic: problems.topic,
      difficulty: problems.difficulty,
      type: problems.type,
      statement: problems.statement,
      tools: problems.tools,
    })
    .from(problems)
    .where(
      and(
        eq(problems.subject, filters.subject),
        eq(problems.verificationStatus, "verified"),
        between(problems.difficulty, filters.minDifficulty, filters.maxDifficulty),
      ),
    )
    .orderBy(sql`random()`)
    .limit(1);

  return rows[0] ?? FALLBACK_PROBLEM;
}
