import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "../../db/client";
import { flags, problems } from "../../db/schema";

// Includes the answer key: the agent repairing a problem needs to see what was wrong with it.
// Besides problems taken out of rotation by a flag, it lists live problems carrying a review note
// (such as a hint that may give the answer away), with inRotation: true.
export async function listFlagged() {
  const withOpenFlags = db.selectDistinct({ id: flags.problemId }).from(flags).where(eq(flags.resolved, false));
  const flagged = await db
    .select()
    .from(problems)
    .where(
      or(
        eq(problems.verificationStatus, "flagged"),
        and(ne(problems.verificationStatus, "retired"), inArray(problems.id, withOpenFlags)),
      ),
    )
    .orderBy(problems.id);
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
    hints: p.hints,
    inRotation: p.verificationStatus === "verified",
    flags: open.filter((f) => f.problemId === p.id).map((f) => ({ id: f.id, reason: f.reason, createdAt: f.createdAt.toISOString() })),
  }));
}
