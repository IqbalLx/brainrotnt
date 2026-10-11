import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db/client";
import { problems, sessionItems } from "../../db/schema";
import { currentItem, findSession, HINT_PENALTY, itemsOf } from "../../sessions/session";

export const revealHintRoute = new Hono();

const revealBody = z.object({ position: z.number().int().min(0) });

// Opens the next hint of the current question. Hints come out one at a time, never skipping ahead,
// and the count is kept here so the credit cannot be argued with by the browser.
revealHintRoute.post("/:id/hints", async (c) => {
  const parsed = revealBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);

  const id = c.req.param("id");
  const session = await findSession(id);
  if (!session) return c.json({ error: "session_not_found" }, 404);
  const item = currentItem(session, await itemsOf(id));
  if (!item) return c.json({ error: "session_ended" }, 409);
  if (item.position !== parsed.data.position) return c.json({ error: "not_the_current_question" }, 409);

  const [problem] = await db.select({ hints: problems.hints }).from(problems).where(eq(problems.id, item.problemId));
  const hints = problem.hints ?? [];
  if (item.hintsRevealed >= hints.length) return c.json({ error: "no_more_hints" }, 409);

  const revealed = item.hintsRevealed + 1;
  // Conditional on the count read above, so a double click cannot open two hints at once.
  const changed = await db
    .update(sessionItems)
    .set({ hintsRevealed: revealed })
    .where(and(eq(sessionItems.sessionId, id), eq(sessionItems.position, item.position), eq(sessionItems.hintsRevealed, item.hintsRevealed)))
    .returning({ position: sessionItems.position });
  if (changed.length === 0) return c.json({ error: "hint_already_opened" }, 409);
  return c.json({ hints: hints.slice(0, revealed), hintsRevealed: revealed, hintCount: hints.length, maxCredit: Math.max(0, 1 - HINT_PENALTY * revealed) });
});
