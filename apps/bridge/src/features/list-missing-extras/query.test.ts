import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { problems } from "../../db/schema";
import { insertProblem, resetDb } from "../../test-support";
import { listMissingExtras } from "./query";

beforeEach(resetDb);

describe("listMissingExtras", () => {
  test("lists live problems lacking hints or an explanation, with what is missing", async () => {
    const bare = await insertProblem({ subject: "math" });
    const hinted = await insertProblem({ subject: "math", hints: ["Think."] });
    await insertProblem({ subject: "math", hints: ["Think."], explanation: "Done.\n\nAnswer: 42" });
    const retired = await insertProblem({ subject: "math" });
    await db.update(problems).set({ verificationStatus: "retired" }).where(eq(problems.id, retired));
    const trivia = await insertProblem({ subject: "trivia", verificationStatus: "unverified", sources: [{ url: "https://a.example.org", quote: "A fact stated here." }] });

    const either = await listMissingExtras({ missing: "either", limit: 10 });
    expect(either.total).toBe(3);
    expect(either.problems.map((p) => [p.id, p.missing])).toEqual([
      [bare, ["hints", "explanation"]],
      [hinted, ["explanation"]],
      [trivia, ["hints", "explanation"]],
    ]);
    expect(either.problems[0]).toMatchObject({ answer: { value: 42, tolerance: 0 }, statement: expect.any(String) });
    expect(either.problems[2].sources).toHaveLength(1);

    expect((await listMissingExtras({ missing: "hints", limit: 10 })).total).toBe(2);
    expect((await listMissingExtras({ missing: "either", subject: "trivia", limit: 10 })).problems.map((p) => p.id)).toEqual([trivia]);
  });

  test("pages with a limit and reports the total", async () => {
    for (let i = 0; i < 5; i++) await insertProblem({ subject: "stats" });
    expect(await listMissingExtras({ missing: "either", limit: 2 })).toMatchObject({ total: 5, returned: 2 });
  });
});
