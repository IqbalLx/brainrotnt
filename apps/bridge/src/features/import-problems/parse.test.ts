import { describe, expect, test } from "bun:test";
import { parseProblemFile } from "./parse";

describe("parseProblemFile", () => {
  test("a single item, a list, and a problems wrapper", () => {
    expect(parseProblemFile("subject: math\ntopic: x")).toEqual({ ok: true, items: [{ subject: "math", topic: "x" }] });
    expect(parseProblemFile("- a: 1\n- b: 2")).toEqual({ ok: true, items: [{ a: 1 }, { b: 2 }] });
    expect(parseProblemFile("problems:\n  - a: 1")).toEqual({ ok: true, items: [{ a: 1 }] });
  });

  test("block scalars keep their newlines, so Python survives intact", () => {
    const result = parseProblemFile("code: |\n  import math\n  print(math.comb(8, 3))\n");
    expect(result).toEqual({ ok: true, items: [{ code: "import math\nprint(math.comb(8, 3))\n" }] });
  });

  test("bad files are explained", () => {
    expect(parseProblemFile("a: [unclosed")).toMatchObject({ ok: false });
    expect((parseProblemFile("a: [unclosed") as any).error).toContain("invalid YAML");
    expect(parseProblemFile("just a string")).toMatchObject({ ok: false, error: expect.stringContaining("expected a problem") });
    expect(parseProblemFile("[]")).toEqual({ ok: false, error: "no problems found" });
    expect(parseProblemFile("")).toMatchObject({ ok: false });
    expect(parseProblemFile("a: 1\na: 2")).toMatchObject({ ok: false });
    expect(parseProblemFile("x".repeat(1_000_001))).toMatchObject({ ok: false, error: expect.stringContaining("larger than") });
  });
});
