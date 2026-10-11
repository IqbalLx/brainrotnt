import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cn, TYPE_STYLES } from "./utils";

describe("cn", () => {
  test("keeps a type style next to a text colour", () => {
    expect(cn("text-label uppercase", "text-brand-ink")).toBe("text-label uppercase text-brand-ink");
    expect(cn("text-body-sm font-medium", "text-on-brand")).toBe("text-body-sm font-medium text-on-brand");
  });

  test("a later type style still replaces an earlier one", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption");
  });

  test("knows every type style defined in index.css", () => {
    const css = readFileSync(join(import.meta.dir, "../index.css"), "utf8");
    const defined = [...css.matchAll(/@utility text-([a-z-]+)/g)].map((m) => m[1]).sort();
    expect([...TYPE_STYLES].sort()).toEqual(defined);
  });
});
