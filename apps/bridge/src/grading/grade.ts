import { checkEquivalent } from "@brainrotnt/math-engine";
import { disclosedTests, withDisclosure } from "../content/disclosure";
import { describeTestFailure, runTests, tryTests, type TestResult } from "../content/run-tests";
import { CODE_LANGUAGES, codeAnswer, mcqAnswer, numericAnswer, symbolicAnswer, type CodeAnswer } from "../db/answer";

export type GradeResult =
  | { status: "graded"; correct: boolean; expected: string; detail?: string }
  | { status: "invalid"; message: string }
  | { status: "unsupported" };

const NUMERIC_INPUT =
  /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?:\s*\/\s*(\d+(?:\.\d*)?))?\s*(.*)$/;

function normalizeUnit(unit: string): string {
  return unit.replace(/\s+/g, "").replace(/²/g, "^2").replace(/³/g, "^3");
}

export function parseNumericInput(input: string): { value: number; unit: string | null } | null {
  const match = NUMERIC_INPUT.exec(input.trim().replace(/−/g, "-"));
  if (!match) return null;

  let value = Number(match[1]);
  if (match[2] !== undefined) {
    const denominator = Number(match[2]);
    if (denominator === 0) return null;
    value /= denominator;
  }
  if (!Number.isFinite(value)) return null;

  const unit = normalizeUnit(match[3]);
  return { value, unit: unit === "" ? null : unit };
}

function gradeMcq(stored: unknown, given: unknown): GradeResult {
  const answer = mcqAnswer.parse(stored);
  if (typeof given !== "number" || !Number.isInteger(given) || given < 0 || given >= answer.options.length) {
    return { status: "invalid", message: "Pick one of the options." };
  }
  return { status: "graded", correct: given === answer.correct, expected: answer.options[answer.correct] };
}

function gradeNumeric(stored: unknown, given: unknown): GradeResult {
  const answer = numericAnswer.parse(stored);
  const parsed =
    typeof given === "number"
      ? Number.isFinite(given)
        ? { value: given, unit: null }
        : null
      : typeof given === "string"
        ? parseNumericInput(given)
        : null;
  if (!parsed) return { status: "invalid", message: "Enter a number, like 12.4 or 1/3." };

  const expected = answer.unit ? `${answer.value} ${answer.unit}` : `${answer.value}`;
  // An omitted unit is accepted (the problem shows it); a wrong one is not.
  if (parsed.unit !== null && answer.unit !== undefined && parsed.unit !== normalizeUnit(answer.unit)) {
    return { status: "graded", correct: false, expected };
  }
  if (parsed.unit !== null && answer.unit === undefined) {
    return { status: "invalid", message: "This problem has no unit; enter just the number." };
  }

  const allowed = answer.value === 0 ? answer.tolerance : answer.tolerance * Math.abs(answer.value);
  return { status: "graded", correct: Math.abs(parsed.value - answer.value) <= allowed, expected };
}

function gradeSymbolic(stored: unknown, given: unknown): GradeResult {
  const answer = symbolicAnswer.parse(stored);
  if (typeof given !== "string") return { status: "invalid", message: "Enter an expression, like 2x + 1." };

  const result = checkEquivalent(answer.expression, given, answer);
  if (!result.ok) {
    return result.reason === "given"
      ? { status: "invalid", message: result.error }
      : { status: "invalid", message: "This problem's answer key cannot be checked. Flag it so it can be repaired." };
  }
  return { status: "graded", correct: result.equivalent, expected: answer.expression };
}

export function grade(type: string, stored: unknown, given: unknown): GradeResult {
  switch (type) {
    case "mcq":
      return gradeMcq(stored, given);
    case "numeric":
      return gradeNumeric(stored, given);
    case "symbolic":
      return gradeSymbolic(stored, given);
    default:
      return { status: "unsupported" };
  }
}

// What a student submits for a code problem.
export type CodeSubmission = { language: (typeof CODE_LANGUAGES)[number]; code: string };

// Code is run, so unlike the other types it grades asynchronously (and never inside the HTTP handler's sync path).
// Checks a code submission's shape and that the problem offers its language.
function readSubmission(answer: CodeAnswer, given: unknown): { ok: true; submission: CodeSubmission } | { ok: false; message: string } {
  const submission = given as Partial<CodeSubmission> | null;
  if (typeof submission !== "object" || submission === null || typeof submission.code !== "string" || !CODE_LANGUAGES.includes(submission.language as never)) {
    return { ok: false, message: "Submit your code and pick a language." };
  }
  const language = submission.language as CodeSubmission["language"];
  if (!answer.languages[language]) return { ok: false, message: `This problem is not available in ${language}.` };
  if (submission.code.trim() === "") return { ok: false, message: "Write some code first." };
  return { ok: true, submission: { language, code: submission.code } };
}

// A failing test's expected value is shown only when the problem's difficulty discloses that test.
export async function gradeCode(stored: unknown, given: unknown, difficulty: number): Promise<GradeResult> {
  const parsed = codeAnswer.parse(stored);
  const answer = { ...parsed, tests: withDisclosure(parsed.tests, difficulty) };
  const read = readSubmission(answer, given);
  if (!read.ok) return { status: "invalid", message: read.message };
  const { language, code } = read.submission;
  const offered = answer.languages[language]!;

  const report = await runTests(language, code, answer);
  if (report.status === "broken") return { status: "invalid", message: report.message };
  if (report.status === "failed") {
    if (report.reason === "timeout") {
      return { status: "graded", correct: false, expected: offered.solution, detail: "Time limit exceeded: the code took too long, possibly an infinite loop." };
    }
    if (report.reason === "output_too_large") {
      return { status: "graded", correct: false, expected: offered.solution, detail: "The code printed far too much output." };
    }
    return { status: "invalid", message: report.reason === "sandbox_unavailable" ? report.message : `The code could not be run: ${report.message}` };
  }

  const correct = report.passed === report.total;
  const summary = `Passed ${report.passed} of ${report.total} tests.`;
  const detail = report.firstFailure ? `${summary} First failure: ${describeTestFailure(answer.entry, report.firstFailure)}` : summary;
  return { status: "graded", correct, expected: offered.solution, detail };
}

export function gradeAttempt(type: string, stored: unknown, given: unknown, difficulty: number): Promise<GradeResult> {
  return type === "code" ? gradeCode(stored, given, difficulty) : Promise.resolve(grade(type, stored, given));
}

export type TrialResult =
  | { status: "ran"; results: TestResult[]; moreTests: number }
  | { status: "timeout" | "output_too_large"; message: string }
  | { status: "invalid"; message: string };

// Runs code against only the tests this difficulty discloses, before submitting. Nothing is recorded,
// and the undisclosed tests never run here, so a trial reveals nothing a submit would not.
export async function tryCode(stored: unknown, given: unknown, difficulty: number): Promise<TrialResult> {
  const answer = codeAnswer.parse(stored);
  const read = readSubmission(answer, given);
  if (!read.ok) return { status: "invalid", message: read.message };
  const shown = disclosedTests(answer.tests, difficulty);
  const tests = answer.tests.filter((_, index) => shown[index]);

  const report = await tryTests(read.submission.language, read.submission.code, answer.entry, tests);
  if (report.status === "broken") return { status: "invalid", message: report.message };
  if (report.status === "failed") {
    if (report.reason === "timeout") return { status: "timeout", message: "Time limit exceeded: the code took too long, possibly an infinite loop." };
    if (report.reason === "output_too_large") return { status: "output_too_large", message: "The code printed far too much output." };
    return { status: "invalid", message: report.reason === "sandbox_unavailable" ? report.message : `The code could not be run: ${report.message}` };
  }
  return { status: "ran", results: report.results, moreTests: answer.tests.length - tests.length };
}
