import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { problems } from "../../db/schema";
import { insertProblem, resetDb } from "../../test-support";
import { getCoverage } from "./query";

beforeEach(resetDb);

describe("getCoverage", () => {
  test("counts verified and flagged per subject, topic and difficulty, and ignores retired versions", async () => {
    await insertProblem({ subject: "math", topic: "algebra", difficulty: 2 });
    await insertProblem({ subject: "math", topic: "algebra", difficulty: 2 });
    const flagged = await insertProblem({ subject: "math", topic: "algebra", difficulty: 2 });
    await db.update(problems).set({ verificationStatus: "flagged" }).where(eq(problems.id, flagged));
    const retired = await insertProblem({ subject: "math", topic: "algebra", difficulty: 2 });
    await db.update(problems).set({ verificationStatus: "retired" }).where(eq(problems.id, retired));
    await insertProblem({ subject: "physics", topic: "kinematics", difficulty: 3 });

    expect(await getCoverage()).toEqual({
      total: 3,
      rows: [
        { subject: "math", topic: "algebra", difficulty: 2, verified: 2, flagged: 1 },
        { subject: "physics", topic: "kinematics", difficulty: 3, verified: 1, flagged: 0 },
      ],
    });
  });

  test("an empty bank is zeros", async () => {
    expect(await getCoverage()).toEqual({ total: 0, rows: [] });
  });
});
