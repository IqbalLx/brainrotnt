import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { toProblemView, type ProblemView } from "../content/problem-view";
import { db } from "../db/client";
import { problems, sessionItems, sessions } from "../db/schema";

export const SESSION_SUBJECTS = ["math", "stats", "physics", "code"] as const;
export const HINT_PENALTY = 0.25;

// Each hint opened takes a quarter off a correct answer; a wrong or skipped answer earns nothing.
export function creditFor(correct: boolean, hintsUsed: number): number {
  return correct ? Math.max(0, 1 - HINT_PENALTY * hintsUsed) : 0;
}

export type SessionRow = typeof sessions.$inferSelect;
export type ItemRow = typeof sessionItems.$inferSelect;

export interface SessionView {
  id: string;
  subjects: string[];
  size: number;
  startedBy: "agent" | "manual";
  startedAt: string;
  endedAt: string | null;
  endReason: SessionRow["endReason"];
  /** Position of the question being answered, or null once every question is resolved or the session ended. */
  position: number | null;
  items: { position: number; outcome: ItemRow["outcome"]; credit: number | null }[];
  current: (ProblemView & { hintsRevealed: number }) | null;
}

const problemColumns = {
  id: problems.id,
  subject: problems.subject,
  topic: problems.topic,
  difficulty: problems.difficulty,
  type: problems.type,
  statement: problems.statement,
  tools: problems.tools,
  answer: problems.answer,
};

export async function findSession(id: string): Promise<SessionRow | null> {
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
  return row ?? null;
}

export async function findOpenSession(): Promise<SessionRow | null> {
  const [row] = await db.select().from(sessions).where(isNull(sessions.endedAt)).orderBy(sql`${sessions.startedAt} desc`).limit(1);
  return row ?? null;
}

export async function itemsOf(sessionId: string): Promise<ItemRow[]> {
  return db.select().from(sessionItems).where(eq(sessionItems.sessionId, sessionId)).orderBy(asc(sessionItems.position));
}

export function currentItem(session: SessionRow, items: ItemRow[]): ItemRow | null {
  if (session.endedAt) return null;
  return items.find((item) => item.outcome === null) ?? null;
}

export async function sessionView(session: SessionRow): Promise<SessionView> {
  const items = await itemsOf(session.id);
  const item = currentItem(session, items);
  let current: SessionView["current"] = null;
  if (item) {
    const [row] = await db.select(problemColumns).from(problems).where(eq(problems.id, item.problemId));
    current = { ...toProblemView(row), hintsRevealed: item.hintsRevealed };
  }
  return {
    id: session.id,
    subjects: session.subjects,
    size: session.size,
    startedBy: session.startedBy,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    endReason: session.endReason,
    position: item?.position ?? null,
    items: items.map(({ position, outcome, credit }) => ({ position, outcome, credit })),
    current,
  };
}

// Closes the session once nothing is left to answer, totalling the credit.
export async function finish(sessionId: string, reason: "completed" | "ended_early" | "abandoned", now = new Date()): Promise<void> {
  const items = await itemsOf(sessionId);
  const score = items.reduce((sum, item) => sum + (item.credit ?? 0), 0);
  await db
    .update(sessions)
    .set({ endedAt: now, endReason: reason, score })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.endedAt)));
}

export async function completeIfDone(sessionId: string): Promise<void> {
  const items = await itemsOf(sessionId);
  if (items.every((item) => item.outcome !== null)) await finish(sessionId, "completed");
}
