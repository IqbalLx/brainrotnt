import { describe, expect, test } from "bun:test";
import { DEFAULT_SETTINGS, effectiveTier, parseStoredSettings, setDifficultyBound, toggleSubject } from "./settings";

describe("setDifficultyBound", () => {
  test("clicking outside the range extends it", () => {
    expect(setDifficultyBound({ min: 2, max: 4 }, 1)).toEqual({ min: 1, max: 4 });
    expect(setDifficultyBound({ min: 2, max: 4 }, 5)).toEqual({ min: 2, max: 5 });
  });

  test("clicking inside moves the nearer bound; a tie moves the lower one", () => {
    expect(setDifficultyBound({ min: 1, max: 5 }, 2)).toEqual({ min: 2, max: 5 });
    expect(setDifficultyBound({ min: 1, max: 5 }, 4)).toEqual({ min: 1, max: 4 });
    expect(setDifficultyBound({ min: 2, max: 4 }, 3)).toEqual({ min: 3, max: 4 });
  });

  test("clicking an end dot shrinks the range, and it can narrow to one level", () => {
    expect(setDifficultyBound({ min: 2, max: 4 }, 2)).toEqual({ min: 3, max: 4 });
    expect(setDifficultyBound({ min: 2, max: 4 }, 4)).toEqual({ min: 2, max: 3 });
    expect(setDifficultyBound({ min: 3, max: 4 }, 4)).toEqual({ min: 3, max: 3 });
  });

  test("a single-level range stays put when its level is clicked", () => {
    expect(setDifficultyBound({ min: 3, max: 3 }, 3)).toEqual({ min: 3, max: 3 });
  });

  test("the result always stays within 1 to 5 and ordered", () => {
    for (let min = 1; min <= 5; min++)
      for (let max = min; max <= 5; max++)
        for (let level = 1; level <= 5; level++) {
          const next = setDifficultyBound({ min, max }, level);
          expect(next.min).toBeGreaterThanOrEqual(1);
          expect(next.max).toBeLessThanOrEqual(5);
          expect(next.min).toBeLessThanOrEqual(next.max);
        }
  });
});

describe("effectiveTier", () => {
  test("the setting caps the problem's tier", () => {
    expect(effectiveTier("scientific", "basic")).toBe("basic");
    expect(effectiveTier("basic", "scientific")).toBe("basic");
    expect(effectiveTier("stats", "none")).toBe("none");
    expect(effectiveTier("none", "stats")).toBe("none");
    expect(effectiveTier("basic", "basic")).toBe("basic");
  });
});

describe("parseStoredSettings", () => {
  const valid = { subjects: ["physics", "math"], minDifficulty: 2, maxDifficulty: 4, calculator: "none", sessionSize: 10 };

  test("reads valid settings, keeping subjects in their usual order", () => {
    expect(parseStoredSettings(JSON.stringify(valid))).toEqual({ ...valid, subjects: ["math", "physics"] } as never);
  });

  test("an unknown session size falls back to the default size only", () => {
    expect(parseStoredSettings(JSON.stringify({ ...valid, sessionSize: 7 })).sessionSize).toBe(5);
    expect(parseStoredSettings(JSON.stringify({ ...valid, sessionSize: undefined })).subjects).toEqual(["math", "physics"]);
  });

  test("v1 settings with one subject are upgraded", () => {
    const v1 = { subject: "code", minDifficulty: 1, maxDifficulty: 3, calculator: "basic" };
    expect(parseStoredSettings(null, JSON.stringify(v1))).toEqual({ subjects: ["code"], minDifficulty: 1, maxDifficulty: 3, calculator: "basic", sessionSize: 5 });
  });

  test("v2 settings win over v1", () => {
    expect(parseStoredSettings(JSON.stringify(valid), JSON.stringify({ subject: "code", minDifficulty: 1, maxDifficulty: 3, calculator: "basic" })).subjects).toEqual(["math", "physics"]);
  });

  test("falls back to defaults for anything invalid", () => {
    expect(parseStoredSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings(JSON.stringify({ ...valid, subjects: [] }))).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings(JSON.stringify({ ...valid, subjects: ["history"] }))).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings(JSON.stringify({ ...valid, minDifficulty: 4, maxDifficulty: 2 }))).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings(JSON.stringify({ ...valid, minDifficulty: 0, maxDifficulty: 9 }))).toEqual(DEFAULT_SETTINGS);
    expect(parseStoredSettings(JSON.stringify({ ...valid, calculator: "graphing" }))).toEqual(DEFAULT_SETTINGS);
  });
});

describe("toggleSubject", () => {
  test("adds in the usual order, removes, and never empties the selection", () => {
    expect(toggleSubject(["physics"], "math")).toEqual(["math", "physics"]);
    expect(toggleSubject(["math", "physics"], "math")).toEqual(["physics"]);
    expect(toggleSubject(["physics"], "physics")).toEqual(["physics"]);
  });

  test("STEM is the default", () => {
    expect(DEFAULT_SETTINGS.subjects).toEqual(["math", "stats", "physics", "code"]);
  });
});
