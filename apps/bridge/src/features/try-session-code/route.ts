import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { CODE_LANGUAGES } from "../../db/answer";
import { db } from "../../db/client";
import { problems } from "../../db/schema";
import { tryCode } from "../../grading/grade";
import { currentItem, findSession, itemsOf } from "../../sessions/session";

export const trySessionCodeRoute = new Hono();

// `answer` like the answer route, so network mode refuses code from other devices in the same way.
const tryBody = z.object({
  position: z.number().int().min(0),
  answer: z.object({ language: z.enum(CODE_LANGUAGES), code: z.string().max(20_000) }),
});

// Runs code for the current question against the tests its difficulty discloses. Nothing is recorded
// and the question stays open, so it can be run as often as wanted before submitting.
trySessionCodeRoute.post("/:id/try", async (c) => {
  const parsed = tryBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);

  const id = c.req.param("id");
  const session = await findSession(id);
  if (!session) return c.json({ error: "session_not_found" }, 404);
  const item = session.endedAt ? null : currentItem(session, await itemsOf(id));
  if (!item) return c.json({ error: "session_ended" }, 409);
  if (item.position !== parsed.data.position) return c.json({ error: "not_the_current_question" }, 409);

  const [problem] = await db.select({ type: problems.type, answer: problems.answer, difficulty: problems.difficulty }).from(problems).where(eq(problems.id, item.problemId));
  if (problem.type !== "code") return c.json({ error: "unsupported_problem_type" }, 422);

  const result = await tryCode(problem.answer, parsed.data.answer, problem.difficulty);
  if (result.status === "invalid") return c.json({ error: "invalid_answer", message: result.message }, 422);
  return c.json(result);
});
