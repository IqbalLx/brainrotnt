import { describe, expect, test } from "bun:test";
import { backfillPrompt, generatePrompt, repairPrompt } from "./prompt";

const base = { subject: "stats" as const, topic: "confidence intervals", minDifficulty: 2, maxDifficulty: 4, count: 10, extras: true, directive: "" };

describe("generatePrompt", () => {
  test("names the skill, count, subject, topic, difficulty and extras", () => {
    expect(generatePrompt(base)).toBe(
      "Use the brainrotnt-problems skill and the brainrotnt MCP tools to add 10 statistics problems on confidence intervals, difficulty 2 to 4. Give each one three hints and an explanation.",
    );
  });

  test("without a topic it asks for the thinnest ones; one level reads as one", () => {
    expect(generatePrompt({ ...base, topic: " ", minDifficulty: 3, maxDifficulty: 3, extras: false })).toBe(
      "Use the brainrotnt-problems skill and the brainrotnt MCP tools to add 10 statistics problems, choosing the thinnest Stats topics from get_coverage, difficulty 3.",
    );
  });

  test("trivia asks for sources, code for both languages, and a directive is appended", () => {
    expect(generatePrompt({ ...base, subject: "trivia", topic: "geography" })).toContain("two sources on different sites");
    expect(generatePrompt({ ...base, subject: "code", topic: "strings" })).toContain("Python and JavaScript");
    expect(generatePrompt({ ...base, directive: "Emphasise worked examples" })).toMatch(/Emphasise worked examples\.$/);
  });
});

describe("repair and backfill prompts", () => {
  test("repair names the problem and the reasons given", () => {
    expect(repairPrompt({ id: "math-1", flags: [{ reason: "unit missing" }] })).toContain('repair brainrotnt problem math-1');
    expect(repairPrompt({ id: "math-1", flags: [{ reason: "unit missing" }] })).toContain('"unit missing"');
    expect(repairPrompt({ id: "math-1", flags: [{ reason: "wrong_or_ambiguous" }] })).not.toContain("flagged:");
  });

  test("backfill says how many and how to batch", () => {
    expect(backfillPrompt(12)).toContain("12 problems without them");
    expect(backfillPrompt(3, "trivia")).toContain("3 Trivia problems");
  });
});
