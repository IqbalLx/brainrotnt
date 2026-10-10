import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { attempts } from "../../db/schema";
import { insertProblem, json, postJson } from "../../test-support";
import { getNextProblemRoute } from "../get-next-problem/route";
import { submitAttemptRoute } from "./route";

const attempt = (problemId: string, answer: string | number) => ({
  problemId,
  answer,
  secondsSpent: 4.5,
  agentState: "working",
});

describe("POST /api/attempts", () => {
  test("grades, records and reveals the expected answer", async () => {
    const id = await insertProblem({ answer: { value: 96, tolerance: 0.01, unit: "m" } });

    const right = await submitAttemptRoute.request("/", postJson(attempt(id, "96 m")));
    expect(right.status).toBe(200);
    expect(await json(right)).toMatchObject({ correct: true, expected: "96 m" });

    const wrong = await submitAttemptRoute.request("/", postJson(attempt(id, "10")));
    expect(await json(wrong)).toMatchObject({ correct: false, expected: "96 m" });

    const rows = await db.select().from(attempts).where(eq(attempts.problemId, id));
    expect(rows.map((r) => r.correct).sort()).toEqual([false, true]);
    expect(rows[0].agentStateAtStart).toBe("working");
  });

  test("invalid answers are rejected and never recorded", async () => {
    const id = await insertProblem();
    const res = await submitAttemptRoute.request("/", postJson(attempt(id, "banana")));
    expect(res.status).toBe(422);
    expect(await db.select().from(attempts).where(eq(attempts.problemId, id))).toHaveLength(0);
  });

  test("unknown problem is 404, bad envelope is 400", async () => {
    expect((await submitAttemptRoute.request("/", postJson(attempt("nope", "1")))).status).toBe(404);
    expect((await submitAttemptRoute.request("/", postJson({ ...attempt("x", "1"), secondsSpent: -1 }))).status).toBe(400);
  });

  test("symbolic problems are not gradable", async () => {
    const id = await insertProblem({ type: "symbolic", answer: { expression: "x" } });
    expect((await submitAttemptRoute.request("/", postJson(attempt(id, "x")))).status).toBe(422);
  });
});

describe("GET /api/problems/next", () => {
  test("never exposes the answer key, and exposes choices for mcq", async () => {
    const id = await insertProblem({
      subject: "stats",
      topic: "key-leak",
      type: "mcq",
      answer: { options: ["right", "wrong"], correct: 0 },
    });
    const body = await json(await getNextProblemRoute.request("/?subject=stats"));
    expect(body.id).toBe(id);
    expect(body.choices).toEqual(["right", "wrong"]);
    expect(JSON.stringify(body)).not.toContain("correct");
    expect(body).not.toHaveProperty("answer");
  });

  test("exclude skips listed ids; symbolic and code are never served", async () => {
    const a = await insertProblem({ subject: "code", topic: "exclude-test", type: "symbolic", answer: {} });
    expect((await getNextProblemRoute.request("/?subject=code")).status).toBe(404);
    const b = await insertProblem({ subject: "stats", topic: "exclude-test" });
    const res = await getNextProblemRoute.request(`/?subject=stats&exclude=${b}`);
    if (res.status === 200) expect((await json(res)).id).not.toBe(b);
    expect(a).not.toBe(b);
  });
});
