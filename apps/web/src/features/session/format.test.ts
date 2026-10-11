import { describe, expect, test } from "bun:test";
import { describeAnswer, formatDuration, formatPoints } from "./format";

describe("format", () => {
  test("points drop trailing zeros", () => {
    expect(formatPoints(3.75)).toBe("3.75");
    expect(formatPoints(1)).toBe("1");
    expect(formatPoints(0.1 + 0.2)).toBe("0.3");
  });

  test("durations", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(754)).toBe("12m 34s");
    expect(formatDuration(60.4)).toBe("1m 00s");
  });

  test("answers read back", () => {
    expect(describeAnswer(2)).toBe("Option C");
    expect(describeAnswer("3x^2 + 2")).toBe("3x^2 + 2");
    expect(describeAnswer({ language: "python", code: "x" })).toBe("python code");
    expect(describeAnswer(null)).toBeNull();
  });
});
