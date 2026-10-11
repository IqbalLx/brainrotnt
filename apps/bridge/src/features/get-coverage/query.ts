import { count, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { problems } from "../../db/schema";

export interface CoverageRow {
  subject: string;
  topic: string;
  difficulty: number;
  verified: number;
  /** Trivia confirmed by fewer than two sites; served with a badge. */
  unverified: number;
  flagged: number;
  /** Live problems (verified or unverified) still lacking hints, or an explanation. */
  missingHints: number;
  missingExplanation: number;
}

const live = sql`${problems.verificationStatus} in ('verified', 'unverified')`;

// Counts per topic and difficulty, so generation can target the gaps. Retired versions are history.
export async function getCoverage(): Promise<{ total: number; missingExtras: number; rows: CoverageRow[] }> {
  const rows = await db
    .select({
      subject: problems.subject,
      topic: problems.topic,
      difficulty: problems.difficulty,
      verified: sql<number>`sum(case when ${problems.verificationStatus} = 'verified' then 1 else 0 end)`.mapWith(Number),
      unverified: sql<number>`sum(case when ${problems.verificationStatus} = 'unverified' then 1 else 0 end)`.mapWith(Number),
      flagged: sql<number>`sum(case when ${problems.verificationStatus} = 'flagged' then 1 else 0 end)`.mapWith(Number),
      missingHints: sql<number>`sum(case when ${live} and ${problems.hints} is null then 1 else 0 end)`.mapWith(Number),
      missingExplanation: sql<number>`sum(case when ${live} and ${problems.explanation} is null then 1 else 0 end)`.mapWith(Number),
    })
    .from(problems)
    .where(sql`${problems.verificationStatus} in ('verified', 'unverified', 'flagged')`)
    .groupBy(problems.subject, problems.topic, problems.difficulty)
    .orderBy(problems.subject, problems.topic, problems.difficulty);

  const [{ total }] = await db.select({ total: count() }).from(problems).where(eq(problems.verificationStatus, "verified"));
  const [{ missing }] = await db
    .select({ missing: count() })
    .from(problems)
    .where(sql`${live} and (${problems.hints} is null or ${problems.explanation} is null)`);
  return { total, missingExtras: missing, rows };
}
