import { beforeEach, describe, expect, test } from "bun:test";
import { flagProblem } from "../flag-problem/query";
import { insertProblem, json, resetDb } from "../../test-support";
import { getCoverageRoute } from "../get-coverage/route";
import { listFlaggedRoute } from "./route";

beforeEach(resetDb);

describe("problem bank routes", () => {
  test("flagged problems come without their answer key, hints or explanation", async () => {
    const id = await insertProblem({ subject: "math", answer: { value: 9137.5, tolerance: 0 }, hints: ["secret hint"], explanation: "Secret.\n\nAnswer: 9137.5" });
    flagProblem({ problemId: id, reason: "ambiguous wording" });
    const body = await json(await listFlaggedRoute.request("/"));
    expect(body).toEqual([expect.objectContaining({ id, inRotation: false, flags: [expect.objectContaining({ reason: "ambiguous wording" })] })]);
    const text = JSON.stringify(body);
    expect(text).not.toContain("9137");
    expect(text).not.toContain("secret hint");
    expect(text).not.toContain("Secret.");
  });

  test("coverage is served as get_coverage computes it", async () => {
    await insertProblem({ subject: "stats", topic: "descriptive", difficulty: 2 });
    const body = await json(await getCoverageRoute.request("/"));
    expect(body).toMatchObject({ total: 1, missingExtras: 1, rows: [{ subject: "stats", topic: "descriptive", difficulty: 2, verified: 1 }] });
  });
});
