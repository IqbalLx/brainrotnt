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
    expect(text).toContain("symbolic");
    expect(text).toContain("{\\\"points\\\"");
    expect(Object.keys(schema.templateSpec as object)).toContain("anyOf");
    expect(JSON.stringify(schema.templateSpec)).toContain("random.Random(seed)");
    expect(schema.supported.subjects).toEqual(["math", "stats", "physics"]);
    expect(schema.limits.maxProblemsPerSubmit).toBe(25);
  });
});
