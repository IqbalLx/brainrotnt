import { checkEquivalent, verifyKeyAgainstPoints } from "@brainrotnt/math-engine";
import { z } from "zod";
import { runPython, type SandboxResult } from "../infra/sandbox-runner";
import type { CodeSpec, ProblemSpec } from "./problem-spec";
import { explanationIssues } from "./explanation";
import { hintLeaks, hintReviewNotes, keyedProblem } from "./hints";
import { describeTestFailure, runTests, type TestReport } from "./run-tests";

/** `notes` are reasons for a person to review an accepted problem; they do not block it. */
export type VerifyResult = { ok: true; notes: string[] } | { ok: false; error: string };

function describeFailure(run: Extract<SandboxResult, { ok: false }>): string {
  switch (run.reason) {
    case "timeout":
      return "reference solution timed out";
    case "output_too_large":
      return "reference solution printed too much output";
    case "sandbox_unavailable":
      return run.message;
    case "nonzero_exit": {
      const tail = run.stderr.trim().split("\n").slice(-3).join(" | ");
      return `reference solution failed: ${tail || run.message}`;
    }
    default:
      return `reference solution could not run: ${run.message}`;
  }
}

function lastLine(output: string): string {
  const lines = output.trim().split("\n");
  return lines[lines.length - 1] ?? "";
}

// Absolute floating-point slack so a key written to full precision is not rejected over rounding noise.
const EPSILON = 1e-9;

export async function verifyReference(spec: ProblemSpec): Promise<VerifyResult> {
  const key = await verifyKey(spec);
  if (!key.ok) return key;
  const keyed = keyedProblem(spec);
  const issues = [
    ...(spec.hints ? await hintLeaks(keyed, spec.hints) : []),
    ...(spec.explanation ? explanationIssues(keyed, spec.explanation) : []),
  ];
  if (issues.length > 0) return { ok: false, error: issues.join("; ") };
  return { ok: true, notes: spec.hints ? hintReviewNotes(keyed, spec.hints) : [] };
}

async function verifyKey(spec: ProblemSpec): Promise<VerifyResult> {
  if (spec.type === "code") return verifyCode(spec);
  const run = await runPython(spec.reference.code);
  if (!run.ok) return { ok: false, error: describeFailure(run) };

  let computed: unknown;
  try {
    computed = JSON.parse(lastLine(run.stdout));
  } catch {
    return { ok: false, error: "reference solution must print one JSON value on its last line" };
  }

  if (spec.type === "symbolic") return verifySymbolic(spec.answer, computed);

  if (spec.type === "mcq") {
    if (computed !== spec.answer.correct) {
      return { ok: false, error: `reference solution picked option ${JSON.stringify(computed)} but the stated key is ${spec.answer.correct}` };
    }
    return { ok: true, notes: [] };
  }

  if (typeof computed !== "number" || !Number.isFinite(computed)) {
    return { ok: false, error: `reference solution must print a finite number, got ${JSON.stringify(computed)}` };
  }
  const { value, tolerance } = spec.answer;
  const allowed = Math.max(value === 0 ? tolerance : tolerance * Math.abs(value), EPSILON * Math.max(1, Math.abs(value)));
  if (Math.abs(computed - value) > allowed) {
    return { ok: false, error: `reference solution computed ${computed} but the stated key is ${value} (tolerance ${tolerance})` };
  }
  return { ok: true, notes: [] };
}

const languageNames = ["python", "javascript"] as const;

function whyNotRun(report: Exclude<TestReport, { status: "ran" }>): string {
  return report.status === "broken" ? report.message : `${report.reason}: ${report.message}`;
}

// A code problem is only as good as its tests, so each offered language has to show that the tests
// accept a correct solution, reject a wrong one, and are not already satisfied by the starter code.
async function verifyCode(spec: CodeSpec): Promise<VerifyResult> {
  const { entry, tests } = spec.answer;
  for (const language of languageNames) {
    const offered = spec.languages[language];
    if (!offered) continue;

    const reference = await runTests(language, offered.reference, { entry, tests });
    if (reference.status !== "ran") return { ok: false, error: `${language} reference solution could not run: ${whyNotRun(reference)}` };
    if (reference.firstFailure) {
      return {
        ok: false,
        error: `${language} reference solution failed test ${reference.firstFailure.index}: ${describeTestFailure(entry, { ...reference.firstFailure, hidden: false })}`,
      };
    }

    const wrong = await runTests(language, offered.wrong, { entry, tests });
    if (wrong.status !== "ran") return { ok: false, error: `${language} wrong solution must still load and run: ${whyNotRun(wrong)}` };
    if (!wrong.firstFailure) {
      return { ok: false, error: `${language} wrong solution passes every test, so the tests cannot tell right from wrong; add tests that catch it` };
    }

    const starter = await runTests(language, offered.starter, { entry, tests });
    if (starter.status === "ran" && !starter.firstFailure) {
      return { ok: false, error: `${language} starter code already passes every test; it must leave the problem unsolved` };
    }
  }
  return { ok: true, notes: [] };
}

const referencePoints = z.object({
  points: z
    .array(z.object({ vars: z.record(z.string(), z.number().finite()), value: z.number().finite() }))
    .min(6, "give at least 6 points")
    .max(200),
});

function verifySymbolic(answer: Extract<ProblemSpec, { type: "symbolic" }>["answer"], computed: unknown): VerifyResult {
  const parsed = referencePoints.safeParse(computed);
  if (!parsed.success) {
    return { ok: false, error: `reference solution must print {"points": [{"vars": {...}, "value": number}, ...]}: ${parsed.error.issues[0]?.message ?? "wrong shape"}` };
  }

  const expected = [...answer.variables].sort().join(",");
  for (const point of parsed.data.points) {
    if (Object.keys(point.vars).sort().join(",") !== expected) {
      return { ok: false, error: `every point must give exactly the variables ${answer.variables.join(", ")}` };
    }
  }

  const key = checkEquivalent(answer.expression, answer.expression, answer);
  if (!key.ok) return { ok: false, error: key.error };

  const verdict = verifyKeyAgainstPoints(answer.expression, answer.variables, parsed.data.points);
  return verdict.ok ? { ok: true, notes: [] } : { ok: false, error: `reference solution disagrees with the key: ${verdict.error}` };
}

// Verifies several problems with a few sandboxes running at once.
export async function verifyAll(specs: ProblemSpec[], concurrency = 4): Promise<VerifyResult[]> {
  const results: VerifyResult[] = new Array(specs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, specs.length) }, async () => {
      while (next < specs.length) {
        const index = next++;
        results[index] = await verifyReference(specs[index]);
      }
    }),
  );
  return results;
}
