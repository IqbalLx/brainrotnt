import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { problems } from "../../db/schema";
import { mcqSpec, numericSpec, resetDb, symbolicSpec } from "../../test-support";
import { getNextProblemRoute } from "../get-next-problem/route";
import { submitProblems } from "./command";

beforeEach(resetDb);

const served = async (subject: string) => (await getNextProblemRoute.request(`/?subject=${subject}`)).json() as Promise<Record<string, any>>;

describe("submitProblems", () => {
  test("verifies, inserts and serves a numeric problem", async () => {
    const result = await submitProblems([numericSpec({ statement: "What is 6 times 7? Give a whole number." })]);
    expect(result).toMatchObject({ submitted: 1, inserted: 1, rejected: 0 });
    const item = result.results[0];
    expect(item.status).toBe("inserted");
    const [row] = await db.select().from(problems).where(eq(problems.id, (item as any).id));
    expect(row).toMatchObject({ verificationStatus: "verified", version: 1, subject: "math", type: "numeric" });
    expect((await served("math")).id).toBe(row.id);
  });

  test("verifies a multiple-choice problem by option index", async () => {
    const result = await submitProblems([mcqSpec()]);
    expect(result.inserted).toBe(1);
  });

  test("rejects a wrong key with a message that says what the reference computed", async () => {
    const result = await submitProblems([numericSpec({ answer: { value: 43, tolerance: 0 } })]);
    expect(result.inserted).toBe(0);
    expect(result.results[0]).toMatchObject({ status: "rejected" });
    expect((result.results[0] as any).errors[0]).toContain("computed 42 but the stated key is 43");
    expect(await db.select().from(problems)).toHaveLength(0);

    const wrongMcq = await submitProblems([mcqSpec({ answer: { options: ["Speed", "Mass", "Velocity", "Energy"], correct: 0 } })]);
    expect((wrongMcq.results[0] as any).errors[0]).toContain("picked option 2 but the stated key is 0");
  });

  test("a relative tolerance accepts a rounded key, and zero tolerance does not", async () => {
    const close = await submitProblems([numericSpec({ answer: { value: 41.9, tolerance: 0.01 } })]);
    expect(close.inserted).toBe(1);
    const exact = await submitProblems([numericSpec({ answer: { value: 41.9, tolerance: 0 } })]);
    expect(exact.inserted).toBe(0);
  });

  test("reference problems that crash or print the wrong shape are rejected with a reason", async () => {
    const crash = await submitProblems([numericSpec({ reference: { code: "raise ValueError('nope')" } })]);
    expect((crash.results[0] as any).errors[0]).toContain("ValueError: nope");
    const text = await submitProblems([numericSpec({ reference: { code: "print('forty-two')" } })]);
    expect((text.results[0] as any).errors[0]).toContain("JSON value");
    const nan = await submitProblems([numericSpec({ reference: { code: "print(1/3 > 2 and 1 or 'x')" } })]);
    expect(nan.inserted).toBe(0);
  });

  test("a reference solution that cheats by printing a constant still has to match", async () => {
    const result = await submitProblems([numericSpec({ reference: { code: "print(99)" } })]);
    expect(result.inserted).toBe(0);
  });

  test("items are independent: valid ones go in, bad ones come back with errors", async () => {
    const result = await submitProblems([
      numericSpec(),
      { subject: "biology", topic: "x", difficulty: 9, type: "numeric", statement: "short" },
      numericSpec({ answer: { value: 1, tolerance: 0 } }),
    ]);
    expect(result).toMatchObject({ submitted: 3, inserted: 1, rejected: 2 });
    expect(result.results.map((r) => r.status)).toEqual(["inserted", "rejected", "rejected"]);
    const errors = (result.results[1] as any).errors.join(" | ");
    expect(errors).toContain("subject");
    expect(errors).toContain("difficulty");
    expect(errors).toContain("statement");
  });

  test("duplicates are rejected against the bank and within a batch", async () => {
    const spec = numericSpec({ statement: "What is 6 times 7? Give a whole number." });
    expect((await submitProblems([spec])).inserted).toBe(1);
    const again = await submitProblems([{ ...spec, statement: "what is   6 TIMES 7?  give a whole number." }]);
    expect((again.results[0] as any).errors[0]).toContain("duplicate");

    const inBatch = await submitProblems([numericSpec({ statement: "A brand new statement about sevens." }), numericSpec({ statement: "A brand new statement about sevens." })]);
    expect(inBatch.results.map((r) => r.status)).toEqual(["inserted", "rejected"]);
    expect((inBatch.results[1] as any).errors[0]).toContain("item 0 in this batch");
  });

  test("ids are generated deterministically and an explicit id cannot be reused", async () => {
    const [first] = (await submitProblems([numericSpec({ statement: "A deterministic id statement here." })])).results;
    expect((first as any).id).toMatch(/^math-arithmetic-[0-9a-f]{8}$/);

    const named = await submitProblems([numericSpec({ id: "my-problem-one", statement: "A statement with an explicit id." })]);
    expect((named.results[0] as any).id).toBe("my-problem-one");
    const reused = await submitProblems([numericSpec({ id: "my-problem-one", statement: "Another statement, same explicit id." })]);
    expect((reused.results[0] as any).errors[0]).toContain("already taken");
  });

  test("multiple-choice options must be distinct", async () => {
    const result = await submitProblems([mcqSpec({ answer: { options: ["Same", "same ", "Other"], correct: 0 }, reference: { code: "print(0)" } })]);
    expect((result.results[0] as any).errors[0]).toContain("distinct");
  });

  test("unsupported types are rejected", async () => {
    const result = await submitProblems([numericSpec({ type: "code", answer: {} })]);
    expect(result.inserted).toBe(0);
  });
});

describe("symbolic problems", () => {
  test("a key that matches the independent reference values is verified, inserted and served", async () => {
    const result = await submitProblems([symbolicSpec()]);
    expect(result).toMatchObject({ inserted: 1, rejected: 0 });
    const [row] = await db.select().from(problems);
    expect(row).toMatchObject({ type: "symbolic", verificationStatus: "verified" });
    expect(row.answer).toMatchObject({ expression: "3*x^2 + 2", variables: ["x"], domain: [-5, 5] });
    expect(((await (await getNextProblemRoute.request("/?subject=math")).json()) as Record<string, any>).variables).toEqual(["x"]);
  });

  test("a wrong key is rejected and the message says where it disagrees", async () => {
    const result = await submitProblems([symbolicSpec({ answer: { expression: "3*x^2 + 3", variables: ["x"] } })]);
    expect(result.inserted).toBe(0);
    expect((result.results[0] as any).errors[0]).toContain("reference solution disagrees with the key");
    expect((result.results[0] as any).errors[0]).toContain("computed");
  });

  test("a reference solution that cheats by printing the key's own values still has to agree", async () => {
    const result = await submitProblems([symbolicSpec({ reference: { code: 'import json\nprint(json.dumps({"points": [{"vars": {"x": v}, "value": 0} for v in range(6)]}))' } })]);
    expect(result.inserted).toBe(0);
  });

  test("malformed reference output is explained", async () => {
    const fewPoints = await submitProblems([symbolicSpec({ reference: { code: 'import json\nprint(json.dumps({"points": [{"vars": {"x": 1}, "value": 5}]}))' } })]);
    expect((fewPoints.results[0] as any).errors[0]).toContain("at least 6 points");
    const wrongVars = await submitProblems([symbolicSpec({ reference: { code: 'import json\nprint(json.dumps({"points": [{"vars": {"y": v}, "value": v} for v in range(6)]}))' } })]);
    expect((wrongVars.results[0] as any).errors[0]).toContain("exactly the variables x");
    const notObject = await submitProblems([symbolicSpec({ reference: { code: "print(5)" } })]);
    expect((notObject.results[0] as any).errors[0]).toContain("must print");
  });

  test("a key that is not usable is rejected", async () => {
    const undefinedKey = await submitProblems([symbolicSpec({ answer: { expression: "sqrt(x)", variables: ["x"], domain: [-5, -1] } })]);
    expect((undefinedKey.results[0] as any).errors.join(" ")).toMatch(/undefined|disagrees/);
    const forbidden = await submitProblems([symbolicSpec({ answer: { expression: "5!", variables: ["x"] } })]);
    expect((forbidden.results[0] as any).errors.join(" ")).toContain("not usable");
  });

  test("the schema refuses bad variables and domains", async () => {
    for (const answer of [
      { expression: "x", variables: [] },
      { expression: "x", variables: ["e"] },
      { expression: "x", variables: ["x", "x"] },
      { expression: "x", variables: ["xy"] },
      { expression: "x", variables: ["x"], domain: [3, -3] },
    ]) {
      expect((await submitProblems([symbolicSpec({ answer })])).inserted).toBe(0);
    }
  });
});
