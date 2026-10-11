import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client";
import { attempts, sessionItems, sessions } from "../db/schema";
import { answerSessionQuestionRoute } from "../features/answer-session-question/route";
import { endSessionRoute } from "../features/end-session/route";
import { getCurrentSessionRoute } from "../features/get-current-session/route";
import { getSessionScoreRoute } from "../features/get-session-score/route";
import { revealHintRoute } from "../features/reveal-hint/route";
import { listSessionsRoute } from "../features/list-sessions/route";
import { skipSessionQuestionRoute } from "../features/skip-session-question/route";
import { startSessionRoute } from "../features/start-session/route";
import { insertProblem, json, postJson, resetDb } from "../test-support";
import { creditFor } from "./session";

const app = new Hono();
for (const route of [listSessionsRoute, startSessionRoute, getCurrentSessionRoute, answerSessionQuestionRoute, skipSessionQuestionRoute, endSessionRoute, getSessionScoreRoute, revealHintRoute]) {
  app.route("/", route);
}

const start = async (body: Record<string, unknown> = {}) => app.request("/", postJson({ subjects: ["math"], ...body }));
const started = async (body: Record<string, unknown> = {}) => {
  const res = await start(body);
  expect(res.status).toBe(201);
  return json(res);
};
const answer = (id: string, position: number, value: unknown) =>
  app.request(`/${id}/answer`, postJson({ position, answer: value, secondsSpent: 3, agentState: "working" }));
const skip = (id: string, position: number) => app.request(`/${id}/skip`, postJson({ position }));

beforeEach(resetDb);

describe("creditFor", () => {
  test("a correct answer loses a quarter per hint, a wrong one earns nothing", () => {
    expect([0, 1, 2, 3].map((hints) => creditFor(true, hints))).toEqual([1, 0.75, 0.5, 0.25]);
    expect(creditFor(false, 0)).toBe(0);
  });
});

describe("starting a session", () => {
  test("picks distinct problems from the selected subjects and difficulty, without answer keys", async () => {
    for (let i = 0; i < 6; i++) await insertProblem({ subject: "math", difficulty: 2 });
    await insertProblem({ subject: "stats", difficulty: 2 });
    await insertProblem({ subject: "math", difficulty: 5 });

    const view = await started({ size: 5, minDifficulty: 1, maxDifficulty: 3 });
    expect(view).toMatchObject({ size: 5, position: 0, startedBy: "manual", endReason: null });
    expect(view.items).toHaveLength(5);
    expect(view.current).toMatchObject({ subject: "math", difficulty: 2, hintsRevealed: 0 });
    expect(view.current).not.toHaveProperty("answer");

    const items = await db.select().from(sessionItems);
    expect(new Set(items.map((i) => i.problemId)).size).toBe(5);
  });

  test("several subjects can be mixed", async () => {
    await insertProblem({ subject: "math" });
    await insertProblem({ subject: "stats" });
    const view = await started({ subjects: ["math", "stats"], size: 5 });
    expect(view.size).toBe(2);
  });

  test("never-seen problems come first", async () => {
    const seen = await insertProblem({ subject: "math" });
    await db.insert(attempts).values({ id: "old", problemId: seen, answerGiven: "1", correct: false, secondsSpent: 1, toolsUsed: [], agentStateAtStart: "idle", timestamp: new Date() });
    const fresh = [await insertProblem({ subject: "math" }), await insertProblem({ subject: "math" })];
    for (let i = 0; i < 5; i++) {
      await resetSessions();
      const view = await started({ size: 2 });
      const ids = (await db.select().from(sessionItems).where(eq(sessionItems.sessionId, view.id))).map((r) => r.problemId);
      expect(ids.sort()).toEqual([...fresh].sort());
    }
  });

  test("problems served in an earlier session count as seen", async () => {
    const a = await insertProblem({ subject: "math" });
    const b = await insertProblem({ subject: "math" });
    const first = await started({ size: 1 });
    const firstId = first.current.id;
    const second = await started({ size: 1 });
    expect(second.current.id).toBe(firstId === a ? b : a);
  });

  test("fewer matching problems make a shorter session; none is a 404", async () => {
    await insertProblem({ subject: "math" });
    expect((await started({ size: 5 })).size).toBe(1);
    expect((await start({ subjects: ["physics"] })).status).toBe(404);
  });

  test("invalid bodies are rejected", async () => {
    expect((await start({ subjects: [] })).status).toBe(400);
    expect((await start({ subjects: ["history"] })).status).toBe(400);
    expect((await start({ minDifficulty: 4, maxDifficulty: 2 })).status).toBe(400);
    expect((await start({ size: 21 })).status).toBe(400);
  });

  test("starting a new session abandons the open one", async () => {
    await insertProblem({ subject: "math" });
    const first = await started();
    const second = await started();
    const [old] = await db.select().from(sessions).where(eq(sessions.id, first.id));
    expect(old).toMatchObject({ endReason: "abandoned", score: 0 });
    expect((await json(await app.request("/current"))).id).toBe(second.id);
  });
});

async function resetSessions() {
  await db.delete(sessionItems);
  await db.delete(sessions);
}

describe("playing a session", () => {
  test("answers are graded, recorded against the session and move to the next question", async () => {
    await insertProblem({ subject: "math", answer: { value: 42, tolerance: 0 } });
    await insertProblem({ subject: "math", answer: { value: 42, tolerance: 0 } });
    const view = await started({ size: 2 });

    const right = await answer(view.id, 0, "42");
    expect(right.status).toBe(200);
    const body = await json(right);
    expect(body).toMatchObject({ correct: true, credit: 1, hintsUsed: 0, expected: "42" });
    expect(body.session).toMatchObject({ position: 1 });

    const [row] = await db.select().from(attempts);
    expect(row).toMatchObject({ sessionId: view.id, hintsUsed: 0, correct: true });

    const wrong = await json(await answer(view.id, 1, "7"));
    expect(wrong).toMatchObject({ correct: false, credit: 0 });
    expect(wrong.session).toMatchObject({ position: null, endReason: "completed" });
  });

  test("hints already opened reduce the credit of a correct answer", async () => {
    await insertProblem({ subject: "math" });
    const view = await started();
    await db.update(sessionItems).set({ hintsRevealed: 2 }).where(eq(sessionItems.sessionId, view.id));
    expect(await json(await answer(view.id, 0, "42"))).toMatchObject({ correct: true, credit: 0.5, hintsUsed: 2 });
    const [row] = await db.select().from(attempts);
    expect(row.hintsUsed).toBe(2);
  });

  test("an unreadable answer is not recorded and the question stays open", async () => {
    await insertProblem({ subject: "math" });
    const view = await started();
    const res = await answer(view.id, 0, "banana");
    expect(res.status).toBe(422);
    expect(await db.select().from(attempts)).toHaveLength(0);
    expect((await json(await app.request("/current"))).position).toBe(0);
  });

  test("a stale or repeated submit cannot land on another question", async () => {
    await insertProblem({ subject: "math" });
    await insertProblem({ subject: "math" });
    const view = await started({ size: 2 });
    expect((await answer(view.id, 1, "42")).status).toBe(409);
    await answer(view.id, 0, "42");
    expect((await answer(view.id, 0, "42")).status).toBe(409);
    expect(await db.select().from(attempts)).toHaveLength(1);
  });

  test("skip gives no credit and moves on; the last resolution completes the session", async () => {
    await insertProblem({ subject: "math" });
    await insertProblem({ subject: "math" });
    const view = await started({ size: 2 });
    const afterSkip = await json(await skip(view.id, 0));
    expect(afterSkip).toMatchObject({ position: 1, items: [{ outcome: "skipped", credit: 0 }, { outcome: null }] });
    const done = await json(await answer(view.id, 1, "42"));
    expect(done.session.endReason).toBe("completed");
    const [row] = await db.select().from(sessions);
    expect(row.score).toBe(1);
  });

  test("ending early closes the session and blocks further answers", async () => {
    await insertProblem({ subject: "math" });
    await insertProblem({ subject: "math" });
    const view = await started({ size: 2 });
    await answer(view.id, 0, "42");
    const ended = await json(await app.request(`/${view.id}/end`, { method: "POST" }));
    expect(ended).toMatchObject({ endReason: "ended_early", position: null, current: null });
    expect((await answer(view.id, 1, "42")).status).toBe(409);
    expect((await skip(view.id, 1)).status).toBe(409);
    expect((await app.request("/current")).status).toBe(404);
  });

  test("unknown sessions are 404", async () => {
    expect((await answer("nope", 0, "1")).status).toBe(404);
    expect((await app.request("/nope/end", { method: "POST" })).status).toBe(404);
    expect((await app.request("/nope/score")).status).toBe(404);
  });
});

describe("the score screen", () => {
  test("is locked while the session is in progress", async () => {
    await insertProblem({ subject: "math" });
    const view = await started();
    expect((await app.request(`/${view.id}/score`)).status).toBe(409);
  });

  test("totals credit and lists every question, including unanswered ones", async () => {
    for (let i = 0; i < 3; i++) await insertProblem({ subject: "math" });
    const view = await started({ size: 3 });
    await db.update(sessionItems).set({ hintsRevealed: 1 }).where(eq(sessionItems.position, 0));
    await answer(view.id, 0, "42");
    await skip(view.id, 1);
    await app.request(`/${view.id}/end`, { method: "POST" });

    const score = await json(await app.request(`/${view.id}/score`));
    expect(score).toMatchObject({ endReason: "ended_early", score: 0.75, maxScore: 3, answered: 1, correct: 1 });
    expect(score.items.map((i: any) => [i.outcome, i.credit, i.hintsUsed])).toEqual([
      ["answered", 0.75, 1],
      ["skipped", 0, 0],
      ["unanswered", 0, 0],
    ]);
    expect(score.items[0].statement).toContain("Test statement");
  });
});

describe("hints", () => {
  const withHints = () => insertProblem({ subject: "math", hints: ["Think about it.", "Set it up.", "Use the formula."] });
  const reveal = (id: string, position: number) => app.request(`/${id}/hints`, postJson({ position }));

  test("only opened hints are sent, one at a time, and the count is kept", async () => {
    await withHints();
    const view = await started();
    expect(view.current).toMatchObject({ hintCount: 3, hintsRevealed: 0, hints: [] });

    expect(await json(await reveal(view.id, 0))).toEqual({ hints: ["Think about it."], hintsRevealed: 1, hintCount: 3, maxCredit: 0.75 });
    expect(await json(await reveal(view.id, 0))).toMatchObject({ hints: ["Think about it.", "Set it up."], maxCredit: 0.5 });
    expect((await json(await app.request("/current"))).current).toMatchObject({ hintsRevealed: 2, hints: ["Think about it.", "Set it up."] });

    await reveal(view.id, 0);
    expect((await reveal(view.id, 0)).status).toBe(409);
    expect(await json(await answer(view.id, 0, "42"))).toMatchObject({ correct: true, credit: 0.25, hintsUsed: 3 });
  });

  test("a problem without hints has none to open", async () => {
    await insertProblem({ subject: "math" });
    const view = await started();
    expect(view.current).toMatchObject({ hintCount: 0, hints: [] });
    expect((await reveal(view.id, 0)).status).toBe(409);
  });

  test("hints can only be opened on the current question of an open session", async () => {
    await withHints();
    await withHints();
    const view = await started({ size: 2 });
    expect((await reveal(view.id, 1)).status).toBe(409);
    await app.request(`/${view.id}/end`, { method: "POST" });
    expect((await reveal(view.id, 0)).status).toBe(409);
  });
});

describe("explanations", () => {
  test("are never sent during play, and unlock on the score screen for resolved questions only", async () => {
    for (let i = 0; i < 3; i++) await insertProblem({ subject: "math", explanation: `Worked solution ${i}.\n\nAnswer: 42` });
    const view = await started({ size: 3 });
    expect(JSON.stringify(view)).not.toContain("Worked solution");
    await answer(view.id, 0, "42");
    expect(JSON.stringify(await json(await app.request("/current")))).not.toContain("Worked solution");
    await skip(view.id, 1);
    await app.request(`/${view.id}/end`, { method: "POST" });

    const score = await json(await app.request(`/${view.id}/score`));
    expect(score.items.map((i: any) => [i.outcome, i.explanation !== null, i.hasExplanation])).toEqual([
      ["answered", true, true],
      ["skipped", true, true],
      ["unanswered", false, true],
    ]);
    expect(score.items[0].explanation).toContain("Answer: 42");
  });
});

describe("trivia in sessions", () => {
  test("unverified trivia is served with a badge; unverified STEM is not served", async () => {
    await insertProblem({ subject: "trivia", verificationStatus: "unverified" });
    await insertProblem({ subject: "math", verificationStatus: "unverified" });
    const view = await started({ subjects: ["trivia", "math"], size: 5 });
    expect(view.size).toBe(1);
    expect(view.current).toMatchObject({ subject: "trivia", unverified: true });
  });

  test("a trivia-only session is possible", async () => {
    await insertProblem({ subject: "trivia" });
    await insertProblem({ subject: "math" });
    const view = await started({ subjects: ["trivia"] });
    expect(view).toMatchObject({ size: 1, subjects: ["trivia"], current: { subject: "trivia", unverified: false } });
  });
});

describe("reviewing past sessions", () => {
  test("the score carries time, hints, subjects and what was answered", async () => {
    await insertProblem({ subject: "math" });
    await insertProblem({ subject: "math" });
    const view = await started({ size: 2 });
    await db.update(sessionItems).set({ hintsRevealed: 1 }).where(eq(sessionItems.position, 0));
    await answer(view.id, 0, "42");
    await skip(view.id, 1);
    const score = await json(await app.request(`/${view.id}/score`));
    expect(score).toMatchObject({ subjects: ["math"], secondsSpent: 3, hintsUsed: 1 });
    expect(score.items[0]).toMatchObject({ type: "numeric", secondsSpent: 3, answerGiven: "42" });
    expect(score.items[1]).toMatchObject({ secondsSpent: null, answerGiven: null });
  });

  test("lists ended sessions newest first, leaving the open one out", async () => {
    await insertProblem({ subject: "math" });
    const first = await started();
    await app.request(`/${first.id}/end`, { method: "POST" });
    const second = await started();
    await app.request(`/${second.id}/end`, { method: "POST" });
    await started();
    const list = await json(await app.request("/"));
    expect(list.map((s: any) => s.id)).toEqual([second.id, first.id]);
    expect(list[0]).toMatchObject({ endReason: "ended_early", score: 0, size: 1 });
  });
});
