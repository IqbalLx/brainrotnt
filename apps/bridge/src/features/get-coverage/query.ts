import { count, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { problems } from "../../db/schema";

export interface CoverageRow {
  subject: string;
  topic: string;
  difficulty: number;
  verified: number;
  flagged: number;
}

// Counts per topic and difficulty, so generation can target the gaps. Retired versions are history.
export async function getCoverage(): Promise<{ total: number; rows: CoverageRow[] }> {
  const rows = await db
    .select({
      subject: problems.subject,
      topic: problems.topic,
      difficulty: problems.difficulty,
      verified: sql<number>`sum(case when ${problems.verificationStatus} = 'verified' then 1 else 0 end)`.mapWith(Number),
      flagged: sql<number>`sum(case when ${problems.verificationStatus} = 'flagged' then 1 else 0 end)`.mapWith(Number),
    })
    .from(problems)
    .where(sql`${problems.verificationStatus} in ('verified', 'flagged')`)
    .groupBy(problems.subject, problems.topic, problems.difficulty)
    .orderBy(problems.subject, problems.topic, problems.difficulty);

  const [{ total }] = await db.select({ total: count() }).from(problems).where(eq(problems.verificationStatus, "verified"));
  return { total, rows };
}
