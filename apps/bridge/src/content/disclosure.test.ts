import { describe, expect, test } from "bun:test";
import { disclosedTests, withDisclosure } from "./disclosure";

const tests = [
  { args: [1], expected: 1, hidden: false },
  { args: [2], expected: 2, hidden: true },
  { args: [3], expected: 3, hidden: false },
  { args: [4], expected: 4, hidden: true },
  { args: [5], expected: 5, hidden: true },
];

describe("disclosedTests", () => {
  test("difficulty 1 shows every test, hidden ones included", () => {
    expect(disclosedTests(tests, 1)).toEqual([true, true, true, true, true]);
  });

  test("harder problems show fewer, the author's visible tests first", () => {
    expect(disclosedTests(tests, 2)).toEqual([true, true, true, false, false]);
    expect(disclosedTests(tests, 3)).toEqual([true, false, true, false, false]);
    expect(disclosedTests(tests, 4)).toEqual([true, false, false, false, false]);
    expect(disclosedTests(tests, 5)).toEqual([true, false, false, false, false]);
  });

  test("at least one test is shown, even for an unknown difficulty", () => {
    expect(disclosedTests(tests, 9).filter(Boolean)).toHaveLength(1);
  });
});

test("withDisclosure marks every undisclosed test hidden", () => {
  expect(withDisclosure(tests, 3).map((t) => t.hidden)).toEqual([false, true, false, true, true]);
  expect(withDisclosure(tests, 1).every((t) => !t.hidden)).toBe(true);
});
