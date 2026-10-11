import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { attempts } from "../../db/schema";
import { codeSpec, insertProblem, json, postJson, resetDb } from "../../test-support";
import { problemSpec, storedAnswer } from "../../content/problem-spec";
import { getNextProblemRoute } from "../get-next-problem/route";
import { submitAttemptRoute } from "./route";

const attempt = (problemId: string, answer: unknown) => ({
  problemId,
  answer,
  secondsSpent: 4.5,
  agentState: "working",
});

beforeEach(resetDb);

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

  test("records which tools were used", async () => {
    const id = await insertProblem();
    await submitAttemptRoute.request("/", postJson({ ...attempt(id, "42"), toolsUsed: ["calculator"] }));
    await submitAttemptRoute.request("/", postJson(attempt(id, "42")));
    const rows = await db.select().from(attempts).where(eq(attempts.problemId, id));
    expect(rows.map((r) => r.toolsUsed).sort()).toEqual([[], ["calculator"]]);
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

  test("symbolic answers: equivalent forms are correct, others are not, and unreadable ones are not recorded", async () => {
    const id = await insertProblem({ type: "symbolic", answer: { expression: "3*x^2 + 2", variables: ["x"], domain: [-5, 5] } });

    const right = await submitAttemptRoute.request("/", postJson(attempt(id, "2 + 3x^2")));
    expect(await json(right)).toMatchObject({ correct: true, expected: "3*x^2 + 2" });
    const wrong = await submitAttemptRoute.request("/", postJson(attempt(id, "3x^2")));
    expect(await json(wrong)).toMatchObject({ correct: false });

    const unreadable = await submitAttemptRoute.request("/", postJson(attempt(id, "y + 1")));
    expect(unreadable.status).toBe(422);
    expect(await json(unreadable)).toMatchObject({ error: "invalid_answer", message: "y is not a variable here; use x" });
    expect(await db.select().from(attempts).where(eq(attempts.problemId, id))).toHaveLength(2);
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

  test("symbolic problems expose their variables but never the key", async () => {
    await insertProblem({ subject: "math", type: "symbolic", answer: { expression: "3*x^2 + 2", variables: ["x"], domain: [-5, 5] } });
    const body = await json(await getNextProblemRoute.request("/?subject=math"));
    expect(body).toMatchObject({ type: "symbolic", variables: ["x"], choices: null, unit: null });
    expect(JSON.stringify(body)).not.toContain("3*x^2");
    expect(body).not.toHaveProperty("answer");
  });

  test("exclude skips listed ids", async () => {
    const a = await insertProblem({ subject: "stats", topic: "exclude-test" });
    const b = await insertProblem({ subject: "stats", topic: "exclude-test" });
    for (let i = 0; i < 10; i++) {
      expect((await json(await getNextProblemRoute.request(`/?subject=stats&exclude=${a}`))).id).toBe(b);
    }
    expect((await getNextProblemRoute.request(`/?subject=stats&exclude=${a},${b}`)).status).toBe(404);
  });
});

describe("code problems", () => {
  const python = (body: string) => ({ language: "python", code: `def solve(numbers):\n${body.replace(/^/gm, "    ")}\n` });
  const insertCode = () =>
    insertProblem({ subject: "code", type: "code", answer: storedAnswer(problemSpec.parse(codeSpec())) as object });

  test("a correct submission is graded, recorded and returns the test summary", async () => {
    const id = await insertCode();
    const res = await submitAttemptRoute.request("/", postJson(attempt(id, python("return sum(n for n in numbers if n % 2 == 0)"))));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ correct: true, detail: "Passed 5 of 5 tests." });
    const [row] = await db.select().from(attempts).where(eq(attempts.problemId, id));
    expect(row.correct).toBe(true);
    expect(row.answerGiven).toMatchObject({ language: "python" });
  });

  test("a wrong submission is recorded as incorrect with the first failing call", async () => {
    const id = await insertCode();
    const body = await json(await submitAttemptRoute.request("/", postJson(attempt(id, python("return sum(numbers)")))));
    expect(body).toMatchObject({ correct: false, detail: expect.stringContaining("First failure: solve([1,2,3,4]) returned 10, expected 6") });
    expect(await db.select().from(attempts).where(eq(attempts.problemId, id))).toHaveLength(1);
  });

  test("code that does not load is rejected without recording an attempt", async () => {
    const id = await insertCode();
    const res = await submitAttemptRoute.request("/", postJson(attempt(id, { language: "python", code: "def solve(" })));
    expect(res.status).toBe(422);
    expect(await json(res)).toMatchObject({ error: "invalid_answer", message: expect.stringContaining("SyntaxError") });
    expect(await db.select().from(attempts)).toHaveLength(0);
  });

  test("oversized code and unknown languages are bad requests", async () => {
    const id = await insertCode();
    expect((await submitAttemptRoute.request("/", postJson(attempt(id, { language: "python", code: "x".repeat(20_001) })))).status).toBe(400);
    expect((await submitAttemptRoute.request("/", postJson(attempt(id, { language: "cobol", code: "x" })))).status).toBe(400);
  });
});
