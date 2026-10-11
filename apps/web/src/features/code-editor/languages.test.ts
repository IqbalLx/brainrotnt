import { describe, expect, test } from "bun:test";
import { formatCall, literal } from "./languages";

describe("literal", () => {
  test("python spells null and booleans its own way, javascript keeps JSON", () => {
    const value = { ok: true, none: null, list: [1, "two", false] };
    expect(literal("python", value)).toBe('{"ok": True, "none": None, "list": [1, "two", False]}');
    expect(literal("javascript", value)).toBe('{"ok": true, "none": null, "list": [1, "two", false]}');
  });

  test("words inside strings are left alone", () => {
    expect(literal("python", "null or true")).toBe('"null or true"');
  });

  test("a call is written with the entry name and each argument", () => {
    expect(formatCall("python", "solve", [[1, 2], null])).toBe("solve([1, 2], None)");
    expect(formatCall("javascript", "solve", [[1, 2], null])).toBe("solve([1, 2], null)");
    expect(formatCall("python", "solve", [])).toBe("solve()");
  });
});
