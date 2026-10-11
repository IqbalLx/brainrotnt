import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { problems } from "../../db/schema";
import { insertProblem, resetDb } from "../../test-support";
import { getCoverage } from "./query";

beforeEach(resetDb);

const extras = { hints: ["Think first."], explanation: "Worked.\n\nAnswer: 42" };

describe("getCoverage", () => {
  test("counts verified and flagged per subject, topic and difficulty, and ignores retired versions", async () => {
    await insertProblem({ subject: "math", topic: "algebra", difficulty: 2, ...extras });
    await insertProblem({ subject: "math", topic: "algebra", difficulty: 2, ...extras });
    const flagged = await insertProblem({ subject: "math", topic: "algebra", difficulty: 2, ...extras });
    await db.update(problems).set({ verificationStatus: "flagged" }).where(eq(problems.id, flagged));
    const retired = await insertProblem({ subject: "math", topic: "algebra", difficulty: 2 });
    await db.update(problems).set({ verificationStatus: "retired" }).where(eq(problems.id, retired));
    await insertProblem({ subject: "physics", topic: "kinematics", difficulty: 3, ...extras });

    expect(await getCoverage()).toEqual({
      total: 3,
      missingExtras: 0,
      rows: [
        { subject: "math", topic: "algebra", difficulty: 2, verified: 2, unverified: 0, flagged: 1, missingHints: 0, missingExplanation: 0 },
        { subject: "physics", topic: "kinematics", difficulty: 3, verified: 1, unverified: 0, flagged: 0, missingHints: 0, missingExplanation: 0 },
      ],
    });
  });

  test("reports trivia topics, unverified ones, and live problems missing hints or explanations", async () => {
    await insertProblem({ subject: "trivia", topic: "geography", difficulty: 1, verificationStatus: "unverified" });
    await insertProblem({ subject: "trivia", topic: "geography", difficulty: 1, hints: ["Europe."] });
    const flagged = await insertProblem({ subject: "trivia", topic: "geography", difficulty: 1 });
    await db.update(problems).set({ verificationStatus: "flagged" }).where(eq(problems.id, flagged));

    expect(await getCoverage()).toEqual({
      total: 1,
      missingExtras: 2,
      rows: [{ subject: "trivia", topic: "geography", difficulty: 1, verified: 1, unverified: 1, flagged: 1, missingHints: 1, missingExplanation: 2 }],
    });
  });

  test("an empty bank is zeros", async () => {
    expect(await getCoverage()).toEqual({ total: 0, missingExtras: 0, rows: [] });
  });
});
