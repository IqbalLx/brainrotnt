import type { CodeAnswer } from "../db/answer";
import { runCalls, valuesMatch, type CallOutcome } from "../infra/code-runner";
import type { Language, SandboxFailure } from "../infra/sandbox-runner";

export interface TestFailure {
  index: number;
  hidden: boolean;
  args: unknown[];
  expected: unknown;
  /** What the code returned, or the error it raised, already formatted for display. */
  got: string;
}

export type TestReport =
  | { status: "ran"; passed: number; total: number; firstFailure: TestFailure | null }
  | { status: "broken"; message: string }
  | { status: "failed"; reason: SandboxFailure; message: string };

const clip = (text: string, limit = 120) => (text.length > limit ? `${text.slice(0, limit)}…` : text);

export interface TestResult {
  args: unknown[];
  expected: unknown;
  passed: boolean;
  /** What the code returned, or the error it raised, already formatted for display. */
  got: string;
}

export type TrialReport = { status: "ran"; results: TestResult[] } | { status: "broken"; message: string } | { status: "failed"; reason: SandboxFailure; message: string };

const gotText = (call: CallOutcome) => (call.ok ? clip(JSON.stringify(call.value)) : `raised ${call.error}`);

// Runs the code against the given tests and reports each one. Only for tests the student may see.
export async function tryTests(language: Language, code: string, entry: string, tests: CodeAnswer["tests"]): Promise<TrialReport> {
  const outcome = await runCalls(language, code, entry, tests.map((t) => t.args));
  if (outcome.status !== "ran") return outcome;
  return {
    status: "ran",
    results: tests.map((test, index) => {
      const call = outcome.calls[index];
      return { args: test.args, expected: test.expected, passed: call.ok && valuesMatch(test.expected, call.value), got: gotText(call) };
    }),
  };
}

export async function runTests(language: Language, code: string, answer: Pick<CodeAnswer, "entry" | "tests">): Promise<TestReport> {
  const outcome = await runCalls(language, code, answer.entry, answer.tests.map((t) => t.args));
  if (outcome.status !== "ran") return outcome;

  let passed = 0;
  let firstFailure: TestFailure | null = null;
  answer.tests.forEach((test, index) => {
    const call = outcome.calls[index];
    if (call.ok && valuesMatch(test.expected, call.value)) {
      passed++;
      return;
    }
    firstFailure ??= { index, hidden: test.hidden, args: test.args, expected: test.expected, got: gotText(call) };
  });
  return { status: "ran", passed, total: answer.tests.length, firstFailure };
}

// How a failing test is described without revealing the expected value of a hidden one.
export function describeTestFailure(entry: string, failure: TestFailure): string {
  const call = `${entry}(${failure.args.map((a) => JSON.stringify(a)).join(", ")})`;
  const expected = failure.hidden ? "" : `, expected ${clip(JSON.stringify(failure.expected))}`;
  return `${clip(call, 160)} ${failure.got.startsWith("raised") ? "" : "returned "}${failure.got}${expected}`;
}
