import { describe, expect, test } from "bun:test";
import { getSchema } from "./query";

describe("getSchema", () => {
  test("describes both problem types and the reference-solution contract", () => {
    const schema = getSchema();
    const text = JSON.stringify(schema);
    expect(Object.keys(schema.problemSpec as object)).toContain("anyOf");
    expect(text).toContain("prints ONE JSON value");
    expect(text).toContain("mcq");
    expect(text).toContain("numeric");
    expect(schema.supported.subjects).toEqual(["math", "stats", "physics"]);
    expect(schema.limits.maxProblemsPerSubmit).toBe(25);
  });
});
