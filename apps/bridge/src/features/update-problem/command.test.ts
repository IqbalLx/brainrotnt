import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { statementHash } from "../../content/hash";
import { db } from "../../db/client";
import { attempts, flags, problems } from "../../db/schema";
import { insertProblem, numericSpec, resetDb } from "../../test-support";
import { flagProblem } from "../flag-problem/query";
import { getNextProblemRoute } from "../get-next-problem/route";
import { submitProblems } from "../submit-problems/command";
import { updateProblem } from "./command";

beforeEach(resetDb);

async function flaggedProblem() {
  const [item] = (await submitProblems([numericSpec({ statement: "What is 6 times 7? Give a whole number." })])).results;
  const id = (item as any).id as string;
  flagProblem({ problemId: id, reason: "the key is wrong" });
  await db.insert(attempts).values({ id: "attempt-1", problemId: id, answerGiven: "1", correct: false, secondsSpent: 2, toolsUsed: [], agentStateAtStart: "working", timestamp: new Date() });
  return id;
}

describe("updateProblem", () => {
  test("inserts the next version, retires the old one, resolves flags and keeps attempts on the old row", async () => {
    const id = await flaggedProblem();
    const repaired = numericSpec({ statement: "What is 6 times 7? Give your answer as a whole number.", answer: { value: 42, tolerance: 0 } });

    const result = await updateProblem(id, repaired);
    expect(result).toEqual({ ok: true, id: `${id}.v2`, version: 2, retired: id });

    const [old] = await db.select().from(problems).where(eq(problems.id, id));
    const [next] = await db.select().from(problems).where(eq(problems.id, `${id}.v2`));
    expect(old.verificationStatus).toBe("retired");
    expect(next).toMatchObject({ verificationStatus: "verified", version: 2 });
    expect((await db.select().from(flags).where(eq(flags.problemId, id)))[0].resolved).toBe(true);
    expect((await db.select().from(attempts).where(eq(attempts.id, "attempt-1")))[0].problemId).toBe(id);

    const servedBody = (await (await getNextProblemRoute.request("/?subject=math")).json()) as Record<string, any>;
    expect(servedBody.id).toBe(`${id}.v2`);
  });

  test("a second repair goes to v3 and does not stack suffixes", async () => {
    const id = await flaggedProblem();
    const v2 = (await updateProblem(id, numericSpec({ statement: "Version two of the six times seven problem." }))) as any;
    const v3 = await updateProblem(v2.id, numericSpec({ statement: "Version three of the six times seven problem." }));
    expect(v3).toMatchObject({ ok: true, id: `${id}.v3`, version: 3, retired: v2.id });
  });

  test("a repair that still fails verification changes nothing", async () => {
    const id = await flaggedProblem();
    const result = await updateProblem(id, numericSpec({ statement: "A still-wrong version of the problem.", answer: { value: 41, tolerance: 0 } }));
    expect(result).toMatchObject({ ok: false });
    expect((await db.select().from(problems).where(eq(problems.id, id)))[0].verificationStatus).toBe("flagged");
    expect(await db.select().from(problems)).toHaveLength(1);
    expect((await db.select().from(flags))[0].resolved).toBe(false);
  });

  test("unknown ids, retired ids, invalid specs and clashes are refused", async () => {
    expect(await updateProblem("nope", numericSpec())).toEqual({ ok: false, errors: ["problem nope not found"] });

    const id = await flaggedProblem();
    const v2 = (await updateProblem(id, numericSpec({ statement: "Replacement statement number one." }))) as any;
    const retired = await updateProblem(id, numericSpec({ statement: "Replacement statement number two." }));
    expect(retired).toMatchObject({ ok: false });
    expect((retired as any).errors[0]).toContain("already replaced");

    expect(await updateProblem(v2.id, { subject: "math" })).toMatchObject({ ok: false });

    const statement = "A statement that already lives in the bank.";
    const other = await insertProblem({ statement, topic: "arithmetic", statementHash: statementHash(statement, "arithmetic") });
    const clash = await updateProblem(v2.id, numericSpec({ statement, topic: "arithmetic" }));
    expect(clash).toMatchObject({ ok: false });
    expect((clash as any).errors[0]).toContain(`already exist as ${other}`);
  });
});
