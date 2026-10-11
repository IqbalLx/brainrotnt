import { and, between, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { attempts, problems, sessionItems, sessions } from "../../db/schema";
import { finish, findSession, type SessionRow } from "../../sessions/session";
import type { StartSessionBody } from "./schema";

// Problems never seen come first, then the ones seen longest ago; ties are broken at random.
// "Seen" means attempted, or served in an earlier session (even if skipped).
async function pickProblems(body: StartSessionBody): Promise<string[]> {
  const lastSeen = sql<number | null>`max(
    coalesce((select max(${attempts.timestamp}) from ${attempts} where ${attempts.problemId} = ${problems.id}), 0),
    coalesce((select max(${sessions.startedAt}) from ${sessionItems} join ${sessions} on ${sessions.id} = ${sessionItems.sessionId}
              where ${sessionItems.problemId} = ${problems.id}), 0)
  )`;
  const rows = await db
    .select({ id: problems.id })
    .from(problems)
    .where(
      and(
        inArray(problems.subject, body.subjects),
        eq(problems.verificationStatus, "verified"),
        between(problems.difficulty, body.minDifficulty, body.maxDifficulty),
      ),
    )
    .orderBy(lastSeen, sql`random()`)
    .limit(body.size);
  return rows.map((r) => r.id);
}

export async function startSession(body: StartSessionBody, now = new Date()): Promise<SessionRow | null> {
  const picked = await pickProblems(body);
  if (picked.length === 0) return null;

  // Only one session is open at a time: starting a new one abandons the old.
  const open = await db.select({ id: sessions.id }).from(sessions).where(isNull(sessions.endedAt));
  for (const { id } of open) await finish(id, "abandoned", now);

  const id = crypto.randomUUID();
  db.transaction((tx) => {
    tx.insert(sessions)
      .values({
        id,
        subjects: body.subjects,
        minDifficulty: body.minDifficulty,
        maxDifficulty: body.maxDifficulty,
        // Fewer matching problems than asked for makes a shorter session rather than none.
        size: picked.length,
        startedBy: body.startedBy,
        startedAt: now,
      })
      .run();
    picked.forEach((problemId, position) => tx.insert(sessionItems).values({ sessionId: id, position, problemId }).run());
  });
  return findSession(id);
}
