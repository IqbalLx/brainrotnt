import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { flags, problems } from "../../db/schema";

// Includes the answer key: the agent repairing a problem needs to see what was wrong with it.
export async function listFlagged() {
  const flagged = await db.select().from(problems).where(eq(problems.verificationStatus, "flagged")).orderBy(problems.id);
  if (flagged.length === 0) return [];

  const open = await db
    .select()
    .from(flags)
    .where(and(inArray(flags.problemId, flagged.map((p) => p.id)), eq(flags.resolved, false)))
    .orderBy(flags.createdAt);

  return flagged.map((p) => ({
    id: p.id,
    version: p.version,
    subject: p.subject,
    topic: p.topic,
    difficulty: p.difficulty,
    type: p.type,
    statement: p.statement,
    tools: p.tools,
    answer: p.answer,
    flags: open.filter((f) => f.problemId === p.id).map((f) => ({ id: f.id, reason: f.reason, createdAt: f.createdAt.toISOString() })),
  }));
}
