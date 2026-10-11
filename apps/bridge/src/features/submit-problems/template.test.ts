import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { problems } from "../../db/schema";
import { resetDb } from "../../test-support";
import { getNextProblemRoute } from "../get-next-problem/route";
import { submitProblems } from "./command";

beforeEach(resetDb);

const PRODUCT_GENERATOR = `
import random
def generate(seed):
    rng = random.Random(seed)
    a, b = rng.randint(11, 99), rng.randint(11, 99)
    return {"params": {"a": a, "b": b}, "answer": a * b}
`;

const template = (overrides: Record<string, unknown> = {}) => ({
  subject: "math",
  topic: "multiplication",
  difficulty: 1,
  type: "numeric",
  tools: { calculator: "none", draw: false },
  template: { statement: "What is {a} times {b}? Give a whole number.", generator: PRODUCT_GENERATOR, variants: 10 },
  answer: { tolerance: 0 },
  ...overrides,
});

const withGenerator = (generator: string, extra: Record<string, unknown> = {}) =>
  template({ template: { statement: "What is {a} times {b}? Give a whole number.", generator, variants: 5, ...extra } });

const errorsOf = (result: Awaited<ReturnType<typeof submitProblems>>) => (result.results[0] as any).errors.join(" | ") as string;

describe("template submission", () => {
  test("expands one generator into distinct, computed, served variants", async () => {
    const result = await submitProblems([template()]);
    expect(result).toMatchObject({ submitted: 1, inserted: 1, rejected: 0, problemsAdded: 10 });
    const item = result.results[0] as { id: string; ids: string[] };
    expect(item.ids).toHaveLength(10);
    expect(item.ids.every((id) => id.startsWith(`${item.id}.s`))).toBe(true);

    const rows = await db.select().from(problems);
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((r) => r.statement)).size).toBe(10);
    for (const row of rows) {
      const [, a, b] = row.statement.match(/What is (\d+) times (\d+)\?/)!.map(Number);
      expect((row.answer as { value: number }).value).toBe(a * b);
      expect(row).toMatchObject({ verificationStatus: "verified", type: "numeric", subject: "math", topic: "multiplication" });
    }
    const served = (await (await getNextProblemRoute.request("/?subject=math")).json()) as Record<string, any>;
    expect(item.ids).toContain(served.id);
  });

  test("the same seeds always give the same problems", async () => {
    const first = await submitProblems([template()]);
    const firstStatements = (await db.select().from(problems).orderBy(problems.id)).map((r) => r.statement);
    await resetDb();
    await submitProblems([template()]);
    expect((await db.select().from(problems).orderBy(problems.id)).map((r) => r.statement)).toEqual(firstStatements);
    expect(first.inserted).toBe(1);
  });

  test("a unit and tolerance apply to every variant", async () => {
    const generator = `
import random
def generate(seed):
    v = random.Random(seed).randint(2, 30)
    return {"params": {"v": v}, "answer": v * 3.0}
`;
    const result = await submitProblems([template({ subject: "physics", topic: "distance", template: { statement: "A cart moves at {v} m/s for 3 s. How far does it go?", generator, variants: 4 }, answer: { tolerance: 0.02, unit: "m" } })]);
    expect(result.inserted).toBe(1);
    const [row] = await db.select().from(problems);
    expect(row.answer).toMatchObject({ tolerance: 0.02, unit: "m" });
  });

  test("multiple-choice templates compute their options", async () => {
    const generator = `
import random
def generate(seed):
    rng = random.Random(seed)
    n = rng.randint(3, 20)
    options = [str(n * 2), str(n * 2 + 1), str(n * 2 - 1), str(n * 2 + 2)]
    return {"params": {"n": n}, "options": options, "correct": 0}
`;
    const result = await submitProblems([{ subject: "math", topic: "doubling", difficulty: 1, type: "mcq", template: { statement: "What is {n} doubled?", generator, variants: 6 } }]);
    expect(result).toMatchObject({ inserted: 1, problemsAdded: 6 });
    const [row] = await db.select().from(problems);
    const n = Number(row.statement.match(/What is (\d+) doubled/)![1]);
    const answer = row.answer as { options: string[]; correct: number };
    expect(answer.options[answer.correct]).toBe(String(n * 2));
  });

  test("noise printed by the author's code does not matter", async () => {
    const result = await submitProblems([withGenerator(`print("debugging noise")\n${PRODUCT_GENERATOR}`)]);
    expect(result.inserted).toBe(1);
  });
});

describe("template rejection", () => {
  test("a generator that fails on some seeds is rejected, naming them", async () => {
    const result = await submitProblems([
      withGenerator(`
import random
def generate(seed):
    a = random.Random(seed).randint(1, 9)
    return {"params": {"a": a, "b": 10 // (seed % 7)}, "answer": 1}
`),
    ]);
    expect(result.inserted).toBe(0);
    expect(errorsOf(result)).toContain("failed");
    expect(errorsOf(result)).toContain("of 50 seeds");
    expect(errorsOf(result)).toContain("ZeroDivisionError");
    expect(await db.select().from(problems)).toHaveLength(0);
  });

  test("a generator that ignores its seed is rejected as non-deterministic", async () => {
    const result = await submitProblems([
      withGenerator(`
import random
def generate(seed):
    a, b = random.randint(11, 99), random.randint(11, 99)
    return {"params": {"a": a, "b": b}, "answer": a * b}
`),
    ]);
    expect(errorsOf(result)).toContain("not deterministic");
  });

  test("params that miss a placeholder, or a statement with none, are rejected", async () => {
    const missing = await submitProblems([withGenerator(`def generate(seed):\n    return {"params": {"a": seed}, "answer": 1}`)]);
    expect(errorsOf(missing)).toContain("missing 'b'");
    const none = await submitProblems([template({ template: { statement: "What is eleven times twelve? Give a number.", generator: PRODUCT_GENERATOR, variants: 3 } })]);
    expect(errorsOf(none)).toContain("placeholder");
  });

  test("unusable output is rejected: wrong shape, non-finite answers, bad options", async () => {
    expect(errorsOf(await submitProblems([withGenerator(`def generate(seed):\n    return {"params": {"a": 1, "b": seed}}`)]))).toContain("must look like");
    expect(errorsOf(await submitProblems([withGenerator(`def generate(seed):\n    return {"params": {"a": 1, "b": seed}, "answer": float("nan")}`)]))).toContain("seeds");
    const dupOptions = await submitProblems([
      { subject: "math", topic: "bad-options", difficulty: 1, type: "mcq", template: { statement: "Pick the right one for {n}.", generator: `def generate(seed):\n    return {"params": {"n": seed}, "options": ["a", "A", "b"], "correct": 0}`, variants: 3 } },
    ]);
    expect(errorsOf(dupOptions)).toContain("distinct");
  });

  test("too few distinct statements for the requested variants", async () => {
    const result = await submitProblems([withGenerator(`def generate(seed):\n    return {"params": {"a": seed % 2, "b": 5}, "answer": 1}`, { variants: 10 })]);
    expect(errorsOf(result)).toContain("only 2 distinct statements");
  });

  test("a missing generate function is explained", async () => {
    const result = await submitProblems([withGenerator("x = 1")]);
    expect(errorsOf(result)).toMatch(/generate|NameError/);
  });

  test("resubmitting the same template is refused, as is a variant that duplicates an existing problem", async () => {
    expect((await submitProblems([template()])).inserted).toBe(1);
    expect(errorsOf(await submitProblems([template()]))).toMatch(/already taken|duplicate/);
    expect(await db.select().from(problems).where(eq(problems.subject, "math"))).toHaveLength(10);
  });

  test("template items and fixed items can share a batch", async () => {
    const fixed = { subject: "physics", topic: "vectors", difficulty: 1, type: "mcq", statement: "Which of these is a vector quantity?", answer: { options: ["Speed", "Velocity"], correct: 1 }, reference: { code: "print(1)" } };
    const result = await submitProblems([fixed, template(), { template: {} }]);
    expect(result.results.map((r) => r.status)).toEqual(["inserted", "inserted", "rejected"]);
    expect(result).toMatchObject({ inserted: 2, rejected: 1, problemsAdded: 11 });
  });
});

describe("template hints", () => {
  test("hints may use the placeholders and are filled per variant", async () => {
    const result = await submitProblems([template({ hints: ["Split {b} into tens and units.", "Work out {a} × 10 first."] })]);
    expect(result.inserted).toBe(1);
    const rows = await db.select().from(problems);
    for (const row of rows) {
      expect(row.hints).toHaveLength(2);
      expect(row.hints![0]).not.toContain("{b}");
      expect(row.statement).toContain(row.hints![1].match(/Work out (\d+)/)![1]);
    }
  });

  test("a hint that states a variant's answer is rejected", async () => {
    const leaky = `
import random
def generate(seed):
    rng = random.Random(seed)
    a, b = rng.randint(11, 99), rng.randint(11, 99)
    return {"params": {"a": a, "b": b, "p": a * b}, "answer": a * b}
`;
    const result = await submitProblems([template({ template: { statement: "What is {a} times {b}? Give a whole number.", generator: leaky, variants: 5 }, hints: ["It is {p}."] })]);
    expect(errorsOf(result)).toContain("hints.0: contains the answer");
  });

  test("a hint with an unknown placeholder is rejected", async () => {
    const result = await submitProblems([template({ hints: ["Use {c}."] })]);
    expect(errorsOf(result)).toContain("a hint uses a {placeholder}");
  });
});
