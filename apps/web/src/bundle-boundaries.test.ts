import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = import.meta.dir;
const files = [...new Bun.Glob("**/*.{ts,tsx}").scanSync(SRC)].filter((f) => !f.endsWith(".test.ts"));

// The maths library is large, so only the lazily loaded calculator may import the engine's main
// entry. Everything else that needs tiers takes the lightweight "/tiers" entry, or mathjs would
// land in the main bundle (it did once, growing it from 87 kB to 269 kB gzipped).
describe("bundle boundaries", () => {
  test("only the calculator imports the engine's main entry", () => {
    const offenders = files.filter((file) => {
      const text = readFileSync(join(SRC, file), "utf8");
      return /from\s+["']@brainrotnt\/math-engine["']/.test(text) && !file.startsWith("features/calculator/");
    });
    expect(offenders.map((f) => relative(SRC, join(SRC, f)))).toEqual([]);
  });

  test("the calculator panel is only ever loaded lazily", () => {
    const importers = files.filter((file) => /from\s+["'][^"']*calculator\/CalculatorPanel["']/.test(readFileSync(join(SRC, file), "utf8")));
    expect(importers).toEqual([]);
  });

  test("the drawing board is only ever loaded lazily", () => {
    const importers = files.filter(
      (file) => /from\s+["'][^"']*\/DrawingBoard["']/.test(readFileSync(join(SRC, file), "utf8")) && !file.endsWith("DrawingBoardPanel.tsx"),
    );
    expect(importers).toEqual([]);
  });
});
