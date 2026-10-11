import { runPython, type SandboxResult } from "../infra/sandbox-runner";
import type { ProblemSpec } from "./problem-spec";

export type VerifyResult = { ok: true } | { ok: false; error: string };

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
  const run = await runPython(spec.reference.code);
  if (!run.ok) return { ok: false, error: describeFailure(run) };

  let computed: unknown;
  try {
    computed = JSON.parse(lastLine(run.stdout));
  } catch {
    return { ok: false, error: "reference solution must print one JSON value on its last line" };
  }

  if (spec.type === "mcq") {
    if (computed !== spec.answer.correct) {
      return { ok: false, error: `reference solution picked option ${JSON.stringify(computed)} but the stated key is ${spec.answer.correct}` };
    }
    return { ok: true };
  }

  if (typeof computed !== "number" || !Number.isFinite(computed)) {
    return { ok: false, error: `reference solution must print a finite number, got ${JSON.stringify(computed)}` };
  }
  const { value, tolerance } = spec.answer;
  const allowed = Math.max(value === 0 ? tolerance : tolerance * Math.abs(value), EPSILON * Math.max(1, Math.abs(value)));
  if (Math.abs(computed - value) > allowed) {
    return { ok: false, error: `reference solution computed ${computed} but the stated key is ${value} (tolerance ${tolerance})` };
  }
  return { ok: true };
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
