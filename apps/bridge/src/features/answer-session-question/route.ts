import { Hono } from "hono";
import { findSession, sessionView } from "../../sessions/session";
import { answerQuestion } from "./command";
import { answerBody } from "./schema";

export const answerSessionQuestionRoute = new Hono();

answerSessionQuestionRoute.post("/:id/answer", async (c) => {
  const parsed = answerBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);

  const id = c.req.param("id");
  const outcome = await answerQuestion(id, parsed.data);
  switch (outcome.status) {
    case "not_found":
      return c.json({ error: "session_not_found" }, 404);
    case "ended":
      return c.json({ error: "session_ended" }, 409);
    case "wrong_position":
      return c.json({ error: "not_the_current_question" }, 409);
    case "unsupported":
      return c.json({ error: "unsupported_problem_type" }, 422);
    case "invalid":
      return c.json({ error: "invalid_answer", message: outcome.message }, 422);
  }
  const { status: _, ...result } = outcome;
  return c.json({ ...result, session: await sessionView((await findSession(id))!) });
});
