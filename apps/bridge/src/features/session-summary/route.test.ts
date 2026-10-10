import { beforeEach, describe, expect, test } from "bun:test";
import { db } from "../../db/client";
import { attempts } from "../../db/schema";
import { insertProblem, json, resetDb } from "../../test-support";
import { sessionSummaryRoute } from "./route";

async function recordAttempt(problemId: string, correct: boolean, at: Date) {
  await db.insert(attempts).values({
    id: crypto.randomUUID(),
    problemId,
    answerGiven: "x",
    correct,
    secondsSpent: 3,
    toolsUsed: [],
    agentStateAtStart: "working",
    timestamp: at,
  });
}

beforeEach(resetDb);

describe("GET /api/session-summary", () => {
  test("counts attempts since the run started, per subject, ignoring earlier ones", async () => {
    const math = await insertProblem({ subject: "math", topic: "summary-test" });
    const physics = await insertProblem({ subject: "physics", topic: "summary-test" });
    const runStart = new Date("2030-01-01T10:00:00Z");

    await recordAttempt(math, true, new Date("2030-01-01T09:59:00Z")); // before the run
    await recordAttempt(math, true, new Date("2030-01-01T10:01:00Z"));
    await recordAttempt(math, false, new Date("2030-01-01T10:02:00Z"));
    await recordAttempt(physics, true, new Date("2030-01-01T10:03:00Z"));

    const res = await sessionSummaryRoute.request(`/?since=${encodeURIComponent(runStart.toISOString())}`);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      attempts: 3,
      correct: 2,
      accuracyPercent: 67,
      bySubject: [
        { subject: "math", attempts: 2, correct: 1 },
        { subject: "physics", attempts: 1, correct: 1 },
      ],
    });
  });

  test("no attempts gives zeros and a null accuracy", async () => {
    const res = await sessionSummaryRoute.request(`/?since=${encodeURIComponent("2040-01-01T00:00:00Z")}`);
    expect(await json(res)).toEqual({ attempts: 0, correct: 0, accuracyPercent: null, bySubject: [] });
  });

  test("rejects a missing or malformed since", async () => {
    expect((await sessionSummaryRoute.request("/")).status).toBe(400);
    expect((await sessionSummaryRoute.request("/?since=yesterday")).status).toBe(400);
  });
});
