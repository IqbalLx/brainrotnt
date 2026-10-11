import type { CodeAnswer } from "../db/answer";

type Tests = CodeAnswer["tests"];

// How many tests a student may see and run before submitting, by difficulty: every test on the easiest
// problems, then fewer, down to one. The rest only run on submit.
const SHOWN: Record<number, number> = { 1: Infinity, 2: 3, 3: 2, 4: 1, 5: 1 };

/**
 * The tests shown for a problem of this difficulty, as one flag per test. The author's visible tests
 * come first (they were chosen as examples), then hidden ones in order when more may be shown. At least
 * one test is always shown.
 */
export function disclosedTests(tests: Tests, difficulty: number): boolean[] {
  const limit = Math.max(1, SHOWN[difficulty] ?? 1);
  const order = [...tests.keys()].sort((a, b) => Number(tests[a].hidden) - Number(tests[b].hidden));
  const shown = new Set(order.slice(0, limit));
  return tests.map((_, index) => shown.has(index));
}

/** The tests with `hidden` set by difficulty rather than by the author, as grading and the UI see them. */
export function withDisclosure(tests: Tests, difficulty: number): Tests {
  const shown = disclosedTests(tests, difficulty);
  return tests.map((test, index) => ({ ...test, hidden: !shown[index] }));
}
