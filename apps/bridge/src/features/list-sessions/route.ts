import { desc, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import { sessions } from "../../db/schema";

export const listSessionsRoute = new Hono();

const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });

// Ended sessions, newest first, for picking one to review.
listSessionsRoute.get("/", async (c) => {
  const parsed = query.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);
  const rows = await db
    .select()
    .from(sessions)
    .where(isNotNull(sessions.endedAt))
    // Timestamps have one-second resolution, so insertion order breaks ties.
    .orderBy(desc(sessions.endedAt), sql`rowid desc`)
    .limit(parsed.data.limit);
  return c.json(
    rows.map((s) => ({
      id: s.id,
      subjects: s.subjects,
      size: s.size,
      startedBy: s.startedBy,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt!.toISOString(),
      endReason: s.endReason,
      score: s.score ?? 0,
    })),
  );
});
