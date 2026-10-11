import { Hono } from "hono";
import { gradeAttempt } from "./grade";
import { findProblemForGrading, recordAttempt } from "./query";
import { submitAttemptBody } from "./schema";

export const submitAttemptRoute = new Hono();

submitAttemptRoute.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = submitAttemptBody.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request", details: parsed.error.flatten() }, 400);
  }

  const problem = await findProblemForGrading(parsed.data.problemId);
  if (!problem) return c.json({ error: "problem_not_found" }, 404);

  const result = await gradeAttempt(problem.type, problem.answer, parsed.data.answer);
  if (result.status === "unsupported") {
    return c.json({ error: "unsupported_problem_type" }, 422);
  }
  if (result.status === "invalid") {
    return c.json({ error: "invalid_answer", message: result.message }, 422);
  }

  const attemptId = await recordAttempt(parsed.data, result.correct);
  return c.json({ attemptId, correct: result.correct, expected: result.expected, detail: result.detail ?? null });
});
