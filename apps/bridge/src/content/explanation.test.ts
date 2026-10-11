import { describe, expect, test } from "bun:test";
import { explanationIssues } from "./explanation";

const numeric = { type: "numeric" as const, answer: { value: 96, tolerance: 0.01, unit: "m" } };
const mcq = { type: "mcq" as const, answer: { options: ["Speed", "Distance", "Displacement", "Energy"], correct: 2 } };
const symbolic = { type: "symbolic" as const, answer: { expression: "3*x^2 + 2", variables: ["x"], domain: [-5, 5] as [number, number] } };

describe("explanationIssues", () => {
  test("a matching Answer line passes, in its usual spellings", () => {
    for (const last of ["Answer: 96 m", "**Answer:** 96", "Answer: $96$ m.", "answer: 96.2 m"]) {
      expect(explanationIssues(numeric, `Use $s = \\frac{1}{2}at^2$.\n\n${last}`)).toEqual([]);
    }
  });

  test("a missing or wrong Answer line is reported", () => {
    expect(explanationIssues(numeric, "So the car travels 96 m.")).toEqual(["explanation: must end with a line 'Answer: <value>'"]);
    expect(explanationIssues(numeric, "Work.\nAnswer: 48 m")[0]).toContain("does not match the key");
    expect(explanationIssues(numeric, "Answer: 96 m\n\nMore text after.")[0]).toContain("must end with");
    expect(explanationIssues(numeric, "Work.\nAnswer: 96 km")[0]).toContain("does not match");
  });

  test("mcq accepts the option text or its letter", () => {
    expect(explanationIssues(mcq, "Speed has no direction.\nAnswer: Displacement")).toEqual([]);
    expect(explanationIssues(mcq, "Answer: C")).toEqual([]);
    expect(explanationIssues(mcq, "Answer: (c)")).toEqual([]);
    expect(explanationIssues(mcq, "Answer: A")[0]).toContain("picks option 0");
    expect(explanationIssues(mcq, "Answer: Velocity")[0]).toContain("not one of the options");
  });

  test("symbolic is checked by equivalence", () => {
    expect(explanationIssues(symbolic, "Power rule.\nAnswer: 2 + 3x^2")).toEqual([]);
    expect(explanationIssues(symbolic, "Answer: $3x^2$")[0]).toContain("does not match");
  });

  test("code explanations need no Answer line", () => {
    expect(explanationIssues({ type: "code", answer: { entry: "solve", tests: [] }, references: {} }, "Loop and add.")).toEqual([]);
  });
});
