import { runProgram, type Language, type SandboxFailure } from "./sandbox-runner";

/*
 * Runs one function against a list of argument lists inside the sandbox and returns what it returned.
 * Comparing with the expected values happens here in the parent: the sandbox only ever sees the
 * arguments, so neither the hidden expected values nor the reference solution can leak from it.
 */

export const ENTRY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

export type CallOutcome = { ok: true; value: unknown } | { ok: false; error: string };

export type RunOutcome =
  | { status: "ran"; calls: CallOutcome[] }
  // The program could not be loaded at all: a syntax error, a missing function.
  | { status: "broken"; message: string }
  | { status: "failed"; reason: SandboxFailure; message: string };

const PYTHON_HARNESS = `
import io, json, math, sys

ENTRY = json.loads(open("entry.json").read())
real_stdout = sys.stdout
sys.stdout = sys.stderr  # whatever the solution prints must not be mistaken for results

def finish(payload):
    real_stdout.write(json.dumps(payload, allow_nan=False))
    real_stdout.flush()

def describe(error):
    text = f"{type(error).__name__}: {error}"
    return text[:200]

try:
    namespace = {"__name__": "solution"}
    exec(compile(open("solution.py", encoding="utf-8").read(), "solution.py", "exec"), namespace)
except SyntaxError as error:
    finish({"broken": f"SyntaxError: {error.msg} (line {error.lineno})"})
    sys.exit(0)
except BaseException as error:
    finish({"broken": describe(error)})
    sys.exit(0)

function = namespace.get(ENTRY)
if not callable(function):
    finish({"broken": f"Define a function named {ENTRY}."})
    sys.exit(0)

calls = []
for args in json.load(open("tests.json")):
    try:
        value = function(*args)
        json.dumps(value, allow_nan=False)
        calls.append({"ok": True, "value": value})
    except (TypeError, ValueError) as error:
        message = str(error)
        if "JSON serializable" in message or "Out of range float" in message:
            calls.append({"ok": False, "error": "returned a value that is not a plain JSON value (list, dict, string, number, boolean or None)"})
        else:
            calls.append({"ok": False, "error": describe(error)})
    except BaseException as error:
        calls.append({"ok": False, "error": describe(error)})

finish({"calls": calls})
`;

const JAVASCRIPT_HARNESS = `
const fs = require("fs");
const entry = JSON.parse(fs.readFileSync("entry.json", "utf8"));
const out = (payload) => fs.writeSync(1, JSON.stringify(payload));
console.log = console.info = console.debug = (...args) => console.error(...args);

const plain = (value) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(plain);
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) return Object.values(value).every(plain);
  return false;
};
const describe = (error) => String(error && error.stack ? error.name + ": " + error.message : error).slice(0, 200);

async function main() {
  let fn;
  try {
    const source = fs.readFileSync("solution.js", "utf8");
    fn = new Function(source + "\\n;return typeof " + entry + " === 'function' ? " + entry + " : undefined;")();
  } catch (error) {
    return out({ broken: describe(error) });
  }
  if (typeof fn !== "function") return out({ broken: "Define a function named " + entry + "." });

  const calls = [];
  for (const args of JSON.parse(fs.readFileSync("tests.json", "utf8"))) {
    try {
      const value = await fn(...args);
      if (value === undefined) calls.push({ ok: false, error: "returned undefined: did you forget to return the result?" });
      else if (!plain(value)) calls.push({ ok: false, error: "returned a value that is not a plain JSON value (array, object, string, number, boolean or null)" });
      else calls.push({ ok: true, value });
    } catch (error) {
      calls.push({ ok: false, error: describe(error) });
    }
  }
  out({ calls });
}
main();
`;

const FILES: Record<Language, { solution: string; harness: string; main: string }> = {
  python: { solution: "solution.py", harness: PYTHON_HARNESS, main: "main.py" },
  javascript: { solution: "solution.js", harness: JAVASCRIPT_HARNESS, main: "main.js" },
};

export async function runCalls(
  language: Language,
  code: string,
  entry: string,
  argLists: unknown[][],
  options: { timeoutMs?: number } = {},
): Promise<RunOutcome> {
  if (!ENTRY_PATTERN.test(entry)) return { status: "broken", message: `${entry} is not a valid function name` };
  const spec = FILES[language];
  const run = await runProgram(
    {
      language,
      main: spec.main,
      files: {
        [spec.main]: spec.harness,
        [spec.solution]: code,
        "entry.json": JSON.stringify(entry),
        "tests.json": JSON.stringify(argLists),
      },
    },
    { timeoutMs: 5000, maxOutputBytes: 256 * 1024, ...options },
  );
  if (!run.ok) return { status: "failed", reason: run.reason, message: run.message };

  try {
    const payload = JSON.parse(run.stdout.trim().split("\n").pop() ?? "");
    if (typeof payload?.broken === "string") return { status: "broken", message: payload.broken };
    if (Array.isArray(payload?.calls) && payload.calls.length === argLists.length) return { status: "ran", calls: payload.calls };
  } catch {
    // fall through
  }
  return { status: "failed", reason: "nonzero_exit", message: "the program did not report results" };
}

const RELATIVE_TOLERANCE = 1e-9;

// Deep equality on JSON values. Numbers get a little slack so 0.1 + 0.2 style sums are not punished.
export function valuesMatch(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(expected - actual) <= RELATIVE_TOLERANCE * Math.max(1, Math.abs(expected));
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((item, i) => valuesMatch(item, actual[i]));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    const keys = Object.keys(expected);
    return keys.length === Object.keys(actual).length && keys.every((key) => key in actual && valuesMatch((expected as Record<string, unknown>)[key], (actual as Record<string, unknown>)[key]));
  }
  return expected === actual;
}
