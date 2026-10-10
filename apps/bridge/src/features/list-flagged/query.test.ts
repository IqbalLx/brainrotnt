import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { flags } from "../../db/schema";
import { insertProblem, resetDb } from "../../test-support";
import { flagProblem } from "../flag-problem/query";
import { listFlagged } from "./query";

beforeEach(resetDb);

describe("listFlagged", () => {
  test("returns flagged problems with their key and open reasons only", async () => {
    const id = await insertProblem({ answer: { value: 7, tolerance: 0 } });
    await insertProblem();
    flagProblem({ problemId: id, reason: "ambiguous wording" });
    flagProblem({ problemId: id, reason: "key looks wrong" });
    await db.update(flags).set({ resolved: true }).where(eq(flags.reason, "ambiguous wording"));

    const list = await listFlagged();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, answer: { value: 7, tolerance: 0 } });
    expect(list[0].flags.map((f) => f.reason)).toEqual(["key looks wrong"]);
  });

  test("nothing flagged is an empty list", async () => {
    await insertProblem();
    expect(await listFlagged()).toEqual([]);
  });
});
