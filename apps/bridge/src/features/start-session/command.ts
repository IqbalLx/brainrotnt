import { and, between, eq, inArray, isNull, or, sql } from "drizzle-orm";
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
        // Trivia with a single source is still served, with an Unverified badge.
        or(eq(problems.verificationStatus, "verified"), and(eq(problems.subject, "trivia"), eq(problems.verificationStatus, "unverified"))),
        between(problems.difficulty, body.minDifficulty, body.maxDifficulty),
      ),
    )
    .orderBy(lastSeen, sql`random()`)
    .limit(body.size);
  return rows.map((r) => r.id);
}

export interface StartedSession {
  session: SessionRow;
  /** True when an agent run found a session already open and kept it instead of starting another. */
  resumed: boolean;
}

export async function startSession(body: StartSessionBody, now = new Date()): Promise<StartedSession | null> {
  const open = await db.select({ id: sessions.id }).from(sessions).where(isNull(sessions.endedAt));

  // An agent run never discards practice in progress: another tab, or a page that has not loaded the
  // open session yet, may ask for a new one. Only a person starting one by hand replaces it.
  if (body.startedBy === "agent" && open.length > 0) {
    const session = await findSession(open[0].id);
    if (session) return { session, resumed: true };
  }

  const picked = await pickProblems(body);
  if (picked.length === 0) return null;

  // Only one session is open at a time: starting a new one by hand abandons the old.
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
  const session = await findSession(id);
  return session && { session, resumed: false };
}
