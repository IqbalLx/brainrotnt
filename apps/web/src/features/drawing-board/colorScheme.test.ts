import { describe, expect, test } from "bun:test";
import { resolveScheme } from "./colorScheme";

describe("resolveScheme", () => {
  test("an explicit data-theme wins over the OS preference", () => {
    expect(resolveScheme("light", false)).toBe("light");
    expect(resolveScheme("dark", true)).toBe("dark");
  });

  test("otherwise it follows the OS, defaulting to dark", () => {
    expect(resolveScheme(null, true)).toBe("light");
    expect(resolveScheme(undefined, false)).toBe("dark");
    expect(resolveScheme("sepia", false)).toBe("dark");
  });
});
