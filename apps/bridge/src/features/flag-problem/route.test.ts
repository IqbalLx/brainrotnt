import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { flags, problems } from "../../db/schema";
import { insertProblem, json, postJson, resetDb } from "../../test-support";
import { getNextProblemRoute } from "../get-next-problem/route";
import { flagProblemRoute } from "./route";

beforeEach(resetDb);

describe("POST /api/flags", () => {
  test("records the flag, marks the problem flagged and stops serving it", async () => {
    const id = await insertProblem({ subject: "physics", topic: "flag-test" });

    const served = await getNextProblemRoute.request(`/?subject=physics`);
    expect(served.status).toBe(200);
    expect((await json(served)).id).toBe(id);

    const res = await flagProblemRoute.request("/", postJson({ problemId: id, reason: "answer key is wrong" }));
    expect(res.status).toBe(201);

    const [problem] = await db.select().from(problems).where(eq(problems.id, id));
    expect(problem.verificationStatus).toBe("flagged");
    const [flag] = await db.select().from(flags).where(eq(flags.problemId, id));
    expect(flag.reason).toBe("answer key is wrong");
    expect(flag.resolved).toBe(false);

    const after = await getNextProblemRoute.request(`/?subject=physics`);
    expect(after.status).toBe(404);
  });

  test("defaults the reason when none is given", async () => {
    const id = await insertProblem();
    const res = await flagProblemRoute.request("/", postJson({ problemId: id }));
    expect(res.status).toBe(201);
    const [flag] = await db.select().from(flags).where(eq(flags.problemId, id));
    expect(flag.reason).toBe("wrong_or_ambiguous");
  });

  test("404 for an unknown problem, 400 for a malformed body", async () => {
    expect((await flagProblemRoute.request("/", postJson({ problemId: "nope" }))).status).toBe(404);
    expect((await flagProblemRoute.request("/", postJson({}))).status).toBe(400);
    expect((await flagProblemRoute.request("/", { method: "POST", body: "not json" })).status).toBe(400);
  });
});
