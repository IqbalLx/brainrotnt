import { describe, expect, test } from "bun:test";
import { hintLeaks, hintReviewNotes } from "./hints";

const numeric = { type: "numeric" as const, answer: { value: 408, tolerance: 0 } };

describe("hintLeaks", () => {
  test("numeric: a number equal to the key is a leak, others are not", async () => {
    expect(await hintLeaks(numeric, ["Multiply 17 by 24 using 17 × 20 + 17 × 4."])).toEqual([]);
    expect((await hintLeaks(numeric, ["Start from 17 × 24.", "It comes to 408."]))[0]).toContain("hints.1: contains the answer (408)");
    expect(await hintLeaks(numeric, ["It is about 1,000"])).toEqual([]);
  });

  test("numeric: a rounded value inside the tolerance still counts", async () => {
    const sd = { type: "numeric" as const, answer: { value: 2.13809, tolerance: 0.005 } };
    expect((await hintLeaks(sd, ["Should be near 2.14"]))[0]).toContain("2.14");
    expect(await hintLeaks(sd, ["Divide by n - 1 = 7"])).toEqual([]);
  });

  test("mcq: naming the correct option is a leak; ruling out others is fine", async () => {
    const mcq = { type: "mcq" as const, answer: { options: ["Speed", "Distance", "Displacement", "Energy"], correct: 2 } };
    expect(await hintLeaks(mcq, ["It is not Speed or Energy."])).toEqual([]);
    expect((await hintLeaks(mcq, ["The answer is displacement."]))[0]).toContain("names the correct option");
  });

  test("mcq: a short option only counts as a whole word", async () => {
    const mcq = { type: "mcq" as const, answer: { options: ["2", "4", "8", "16"], correct: 1 } };
    expect(await hintLeaks(mcq, ["Count the 24 hours."])).toEqual([]);
    expect(await hintLeaks(mcq, ["It is 4."])).toHaveLength(1);
  });

  test("symbolic: the key, however spaced, is a leak", async () => {
    const symbolic = { type: "symbolic" as const, answer: { expression: "3*x^2 + 2" } };
    expect(await hintLeaks(symbolic, ["Use the power rule on x^3."])).toEqual([]);
    expect(await hintLeaks(symbolic, ["You should get 3x^2+2."])).toHaveLength(1);
  });

  test("code: a hint whose code passes every test is a solution", async () => {
    const code = {
      type: "code" as const,
      answer: { entry: "solve", tests: [{ args: [[1, 2]], expected: 2, hidden: false }, { args: [[3]], expected: 0, hidden: true }] },
      references: { python: "def solve(n):\n    return sum(x for x in n if x % 2 == 0)\n" },
    };
    expect(await hintLeaks(code, ["Filter with `x % 2 == 0`, then add them up."])).toEqual([]);
    const leak = "Like this:\n```python\ndef solve(numbers):\n    return sum(n for n in numbers if n % 2 == 0)\n```";
    expect((await hintLeaks(code, [leak]))[0]).toContain("complete python solution");
    const partial = "```python\ndef solve(numbers):\n    total = 0\n    # loop and add the even ones\n    return total\n```";
    expect(await hintLeaks(code, [partial])).toEqual([]);
  });
});

describe("hintReviewNotes", () => {
  const code = (reference: string) => ({
    type: "code" as const,
    answer: { entry: "solve", tests: [] },
    references: { python: reference },
  });
  const reference = "def solve(numbers):\n    return sum(n for n in numbers if n % 2 == 0)\n";

  test("flags a third hint that is mostly the reference", () => {
    const hints = ["Think about parity.", "Use a generator expression.", "return sum(n for n in numbers if n % 2 == 0)"];
    expect(hintReviewNotes(code(reference), hints)).toEqual([expect.stringContaining("hint 3 shares most of its code with the python reference")]);
  });

  test("leaves a conceptual third hint alone, and only looks at hint 3", () => {
    expect(hintReviewNotes(code(reference), ["a", "b", "Keep a running total and add a number only when it divides by 2."])).toEqual([]);
    expect(hintReviewNotes(code(reference), ["return sum(n for n in numbers if n % 2 == 0)"])).toEqual([]);
  });
});
