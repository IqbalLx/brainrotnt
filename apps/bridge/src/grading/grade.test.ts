import { describe, expect, test } from "bun:test";
import { problemSpec, storedAnswer } from "../content/problem-spec";
import { codeSpec } from "../test-support";
import { grade, gradeAttempt, parseNumericInput } from "./grade";

const numeric = (value: number, tolerance = 0.01, unit?: string) => ({ value, tolerance, unit });
const correct = (r: ReturnType<typeof grade>) => r.status === "graded" && r.correct;

describe("parseNumericInput", () => {
  test("plain, signed, scientific and unicode minus", () => {
    expect(parseNumericInput("12.4")).toEqual({ value: 12.4, unit: null });
    expect(parseNumericInput("-3")).toEqual({ value: -3, unit: null });
    expect(parseNumericInput("−3")).toEqual({ value: -3, unit: null });
    expect(parseNumericInput("1.2e3")).toEqual({ value: 1200, unit: null });
    expect(parseNumericInput(".5")).toEqual({ value: 0.5, unit: null });
  });

  test("fractions and units", () => {
    expect(parseNumericInput("1/4")?.value).toBe(0.25);
    expect(parseNumericInput("9.8 m/s²")).toEqual({ value: 9.8, unit: "m/s^2" });
    expect(parseNumericInput("5eV")).toEqual({ value: 5, unit: "eV" });
  });

  test("rejects non-numbers and division by zero", () => {
    expect(parseNumericInput("abc")).toBeNull();
    expect(parseNumericInput("")).toBeNull();
    expect(parseNumericInput("1/0")).toBeNull();
  });
});

describe("numeric grading", () => {
  test("relative tolerance boundaries", () => {
    expect(correct(grade("numeric", numeric(100, 0.01), "100"))).toBe(true);
    expect(correct(grade("numeric", numeric(100, 0.01), "101"))).toBe(true);
    expect(correct(grade("numeric", numeric(100, 0.01), "101.5"))).toBe(false);
    expect(correct(grade("numeric", numeric(-100, 0.01), "-100.5"))).toBe(true);
  });

  test("zero tolerance means exact", () => {
    expect(correct(grade("numeric", numeric(408, 0), "408"))).toBe(true);
    expect(correct(grade("numeric", numeric(408, 0), "409"))).toBe(false);
  });

  test("expected value of zero uses absolute tolerance", () => {
    expect(correct(grade("numeric", numeric(0, 0.05), "0.04"))).toBe(true);
    expect(correct(grade("numeric", numeric(0, 0.05), "0.06"))).toBe(false);
  });

  test("units: matching and omitted accepted, wrong rejected, unexpected invalid", () => {
    const withUnit = numeric(96, 0.01, "m");
    expect(correct(grade("numeric", withUnit, "96 m"))).toBe(true);
    expect(correct(grade("numeric", withUnit, "96"))).toBe(true);
    expect(correct(grade("numeric", withUnit, "96 km"))).toBe(false);
    expect(grade("numeric", numeric(5), "5 m").status).toBe("invalid");
  });

  test("fractions grade against the decimal key", () => {
    expect(correct(grade("numeric", numeric(0.25, 0), "1/4"))).toBe(true);
  });

  test("garbage input is invalid, not incorrect", () => {
    expect(grade("numeric", numeric(1), "banana")).toEqual({
      status: "invalid",
      message: "Enter a number, like 12.4 or 1/3.",
    });
  });

  test("reports the expected answer with its unit", () => {
    expect(grade("numeric", numeric(96, 0.01, "m"), "1")).toEqual({
      status: "graded",
      correct: false,
      expected: "96 m",
    });
  });
});

describe("mcq grading", () => {
  const stored = { options: ["a", "b", "c"], correct: 1 };

  test("correct and incorrect", () => {
    expect(grade("mcq", stored, 1)).toEqual({ status: "graded", correct: true, expected: "b" });
    expect(grade("mcq", stored, 0)).toEqual({ status: "graded", correct: false, expected: "b" });
  });

  test("out-of-range, non-integer and non-number choices are invalid", () => {
    expect(grade("mcq", stored, 3).status).toBe("invalid");
    expect(grade("mcq", stored, -1).status).toBe("invalid");
    expect(grade("mcq", stored, 1.5).status).toBe("invalid");
    expect(grade("mcq", stored, "1").status).toBe("invalid");
  });
});

describe("symbolic grading", () => {
  const stored = { expression: "3*x^2 + 2", variables: ["x"], domain: [-5, 5] };
  const graded = (given: unknown) => grade("symbolic", stored, given);

  test("any equivalent form is correct", () => {
    for (const given of ["3*x^2 + 2", "3x^2+2", "2 + 3x^2", "3*(x^2) + 2", "(6*x^2 + 4)/2"]) {
      expect(graded(given)).toEqual({ status: "graded", correct: true, expected: "3*x^2 + 2" });
    }
  });

  test("a different expression is incorrect and reveals the key", () => {
    expect(graded("3*x^2")).toEqual({ status: "graded", correct: false, expected: "3*x^2 + 2" });
    expect(graded("3x + 2")).toMatchObject({ status: "graded", correct: false });
    expect(graded("3*x^2 + 2.001")).toMatchObject({ status: "graded", correct: false });
  });

  test("unreadable or disallowed input is invalid, not incorrect", () => {
    expect(graded("y^2")).toEqual({ status: "invalid", message: "y is not a variable here; use x" });
    expect(graded("")).toMatchObject({ status: "invalid" });
    expect(graded("evaluate('1+1')")).toMatchObject({ status: "invalid" });
    expect(graded("a = 3")).toMatchObject({ status: "invalid" });
    expect(graded("3x +")).toMatchObject({ status: "invalid" });
    expect(graded(42)).toEqual({ status: "invalid", message: "Enter an expression, like 2x + 1." });
  });

  test("a broken key is reported without blaming the student", () => {
    const result = grade("symbolic", { expression: "sqrt(x)", variables: ["x"], domain: [-5, -1] }, "sqrt(x)");
    expect(result).toEqual({ status: "invalid", message: expect.stringContaining("Flag it") });
  });
});

describe("code grading", () => {
  const stored = storedAnswer(problemSpec.parse(codeSpec()));
  const submit = (language: string, code: string) => gradeAttempt("code", stored, { language, code });
  const py = (body: string) => `def solve(numbers):\n${body.replace(/^/gm, "    ")}\n`;

  test("a correct solution passes all tests in either language", async () => {
    expect(await submit("python", py("return sum(n for n in numbers if n % 2 == 0)"))).toMatchObject({
      status: "graded",
      correct: true,
      detail: "Passed 5 of 5 tests.",
    });
    const js = "function solve(numbers) { return numbers.filter((n) => n % 2 === 0).reduce((a, b) => a + b, 0); }";
    expect(await submit("javascript", js)).toMatchObject({ status: "graded", correct: true });
  });

  test("a failing visible test is described with its input and expected value", async () => {
    const result = await submit("python", py("return sum(numbers)"));
    expect(result).toMatchObject({ status: "graded", correct: false });
    expect(result.status === "graded" && result.detail).toBe("Passed 2 of 5 tests. First failure: solve([1,2,3,4]) returned 10, expected 6");
  });

  test("a failing hidden test shows the input and the output but never the expected value", async () => {
    // Passes both visible tests, fails the first hidden one.
    const result = await submit("python", py("return sum(n for n in numbers if n % 2 == 0) + (1 if numbers == [7, 9] else 0)"));
    expect(result.status === "graded" && result.detail).toBe("Passed 4 of 5 tests. First failure: solve([7,9]) returned 1");
  });

  test("an exception is described rather than hidden", async () => {
    const result = await submit("python", py("return numbers[10]"));
    expect(result.status === "graded" && result.detail).toContain("raised IndexError");
  });

  test("an infinite loop is graded incorrect with a time limit message", async () => {
    const result = await submit("python", py("while True: pass"));
    expect(result).toMatchObject({ status: "graded", correct: false, detail: expect.stringContaining("Time limit exceeded") });
  }, 15_000);

  test("a failing answer reveals the reference solution for that language", async () => {
    const result = await submit("javascript", "function solve(numbers) { return 0; }");
    expect(result.status === "graded" && result.expected).toContain("reduce");
  });

  test("unrunnable or unusable submissions are invalid, not incorrect", async () => {
    expect(await submit("python", "def solve(numbers)\n    return 1\n")).toMatchObject({ status: "invalid", message: expect.stringContaining("SyntaxError") });
    expect(await submit("python", "x = 1\n")).toEqual({ status: "invalid", message: "Define a function named solve." });
    expect(await submit("python", "   ")).toEqual({ status: "invalid", message: "Write some code first." });
    expect(await submit("ruby", "puts 1")).toEqual({ status: "invalid", message: "Submit your code and pick a language." });
    expect(await gradeAttempt("code", stored, "just text")).toEqual({ status: "invalid", message: "Submit your code and pick a language." });
  });

  test("a language the problem does not offer is invalid", async () => {
    const pythonOnly = storedAnswer(problemSpec.parse({ ...codeSpec(), languages: { python: (codeSpec() as any).languages.python } }));
    expect(await gradeAttempt("code", pythonOnly, { language: "javascript", code: "function solve() {}" })).toEqual({
      status: "invalid",
      message: "This problem is not available in javascript.",
    });
  });
});

describe("other types", () => {
  test("unknown types are unsupported", () => {
    expect(grade("essay", {}, "x")).toEqual({ status: "unsupported" });
  });
});
