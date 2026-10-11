import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import { sessionItems } from "../../db/schema";
import { completeIfDone, currentItem, findSession, itemsOf, sessionView } from "../../sessions/session";

export const skipSessionQuestionRoute = new Hono();

const skipBody = z.object({ position: z.number().int().min(0) });

// A skip resolves the question with no credit; its explanation still unlocks at the end.
skipSessionQuestionRoute.post("/:id/skip", async (c) => {
  const parsed = skipBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);

  const id = c.req.param("id");
  const session = await findSession(id);
  if (!session) return c.json({ error: "session_not_found" }, 404);
  const item = currentItem(session, await itemsOf(id));
  if (!item) return c.json({ error: "session_ended" }, 409);
  if (item.position !== parsed.data.position) return c.json({ error: "not_the_current_question" }, 409);

  await db
    .update(sessionItems)
    .set({ outcome: "skipped", credit: 0, resolvedAt: new Date() })
    .where(and(eq(sessionItems.sessionId, id), eq(sessionItems.position, item.position)));
  await completeIfDone(id);
  return c.json(await sessionView((await findSession(id))!));
});
