import { checkEquivalent } from "@brainrotnt/math-engine";
import { describeTestFailure, runTests } from "../content/run-tests";
import { CODE_LANGUAGES, codeAnswer, mcqAnswer, numericAnswer, symbolicAnswer } from "../db/answer";

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
export async function gradeCode(stored: unknown, given: unknown): Promise<GradeResult> {
  const answer = codeAnswer.parse(stored);
  const submission = given as Partial<CodeSubmission> | null;
  if (typeof submission !== "object" || submission === null || typeof submission.code !== "string" || !CODE_LANGUAGES.includes(submission.language as never)) {
    return { status: "invalid", message: "Submit your code and pick a language." };
  }
  const language = submission.language as CodeSubmission["language"];
  const offered = answer.languages[language];
  if (!offered) return { status: "invalid", message: `This problem is not available in ${language}.` };
  if (submission.code.trim() === "") return { status: "invalid", message: "Write some code first." };

  const report = await runTests(language, submission.code, answer);
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

export function gradeAttempt(type: string, stored: unknown, given: unknown): Promise<GradeResult> {
  return type === "code" ? gradeCode(stored, given) : Promise.resolve(grade(type, stored, given));
}
