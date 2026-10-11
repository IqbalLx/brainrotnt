import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { problems } from "../../db/schema";

export const MISSING_PAGE_MAX = 50;

export interface ListMissingExtrasInput {
  missing: "hints" | "explanation" | "either";
  subject?: string;
  limit: number;
}

// Live problems without hints or an explanation, with everything needed to write them. Backfilling goes
// through update_problem with the full problem, so the key and sources are included; there is no
// reference solution to return (none is stored), so one must be written again.
export async function listMissingExtras({ missing, subject, limit }: ListMissingExtrasInput) {
  const lacking =
    missing === "hints" ? isNull(problems.hints) : missing === "explanation" ? isNull(problems.explanation) : or(isNull(problems.hints), isNull(problems.explanation));
  const where = and(inArray(problems.verificationStatus, ["verified", "unverified"]), lacking, subject ? eq(problems.subject, subject as never) : undefined);

  const [{ total }] = await db.select({ total: sql<number>`count(*)`.mapWith(Number) }).from(problems).where(where);
  const rows = await db.select().from(problems).where(where).orderBy(problems.subject, problems.topic, problems.id).limit(limit);

  return {
    total,
    returned: rows.length,
    problems: rows.map((p) => ({
      id: p.id,
      version: p.version,
      subject: p.subject,
      topic: p.topic,
      difficulty: p.difficulty,
      type: p.type,
      statement: p.statement,
      tools: p.tools,
      answer: p.answer,
      sources: p.sources,
      source: p.source,
      hints: p.hints,
      explanation: p.explanation,
      missing: [...(p.hints === null ? ["hints"] : []), ...(p.explanation === null ? ["explanation"] : [])],
    })),
  };
}
