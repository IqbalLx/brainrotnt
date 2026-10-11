import { describe, expect, test } from "bun:test";
import { runCalls, valuesMatch } from "./code-runner";
import { getSandboxMode } from "./sandbox-runner";

const strict = (await getSandboxMode()) === "strict";

const ran = async (...args: Parameters<typeof runCalls>) => {
  const outcome = await runCalls(...args);
  if (outcome.status !== "ran") throw new Error(`expected a run, got ${JSON.stringify(outcome)}`);
  return outcome.calls;
};

describe.each([
  {
    language: "python" as const,
    add: "def solve(a, b):\n    return a + b\n",
    boom: "def solve(a, b):\n    raise ValueError('bad input')\n",
    silent: "def solve(a, b):\n    pass\n",
    set: "def solve(a, b):\n    return {a, b}\n",
    nan: "def solve(a, b):\n    return float('nan')\n",
    noisy: "def solve(a, b):\n    print('debugging', a)\n    return a + b\n",
    syntax: "def solve(a, b)\n    return a\n",
    loop: "def solve(a, b):\n    while True: pass\n",
    leak: "import os\ndef solve(a, b):\n    return os.environ.get('BRAINROTNT_FAKE_SECRET', 'none')\n",
    net: "import socket\ndef solve(a, b):\n    try:\n        socket.create_connection(('1.1.1.1', 53), timeout=2)\n        return 'reached'\n    except OSError as e:\n        return 'blocked'\n",
  },
  {
    language: "javascript" as const,
    add: "function solve(a, b) {\n  return a + b;\n}\n",
    boom: "function solve(a, b) {\n  throw new Error('bad input');\n}\n",
    silent: "function solve(a, b) {\n}\n",
    set: "function solve(a, b) {\n  return new Set([a, b]);\n}\n",
    nan: "function solve(a, b) {\n  return NaN;\n}\n",
    noisy: "function solve(a, b) {\n  console.log('debugging', a);\n  return a + b;\n}\n",
    syntax: "function solve(a, b) {\n  return a +;\n}\n",
    loop: "function solve(a, b) {\n  while (true) {}\n}\n",
    leak: "function solve(a, b) {\n  return process.env.BRAINROTNT_FAKE_SECRET ?? 'none';\n}\n",
    net: "async function solve(a, b) {\n  try {\n    await fetch('http://1.1.1.1', { signal: AbortSignal.timeout(2000) });\n    return 'reached';\n  } catch (e) {\n    return 'blocked';\n  }\n}\n",
  },
])("code runner ($language)", ({ language, add, boom, silent, set, nan, noisy, syntax, loop, leak, net }) => {
  const calls = [[1, 2], [10, -4]];

  test("returns what the function returned for each call", async () => {
    expect(await ran(language, add, "solve", calls)).toEqual([
      { ok: true, value: 3 },
      { ok: true, value: 6 },
    ]);
  });

  test("an exception is reported for that call, not for the whole run", async () => {
    const results = await ran(language, boom, "solve", calls);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ ok: false, error: expect.stringContaining("bad input") });
  });

  test("returning nothing or a non-JSON value is reported for the call", async () => {
    expect((await ran(language, silent, "solve", calls))[0].ok).toBe(language === "python");
    expect((await ran(language, set, "solve", calls))[0]).toMatchObject({ ok: false, error: expect.stringContaining("not a plain JSON value") });
    expect((await ran(language, nan, "solve", calls))[0]).toMatchObject({ ok: false });
  });

  test("printing in the solution does not corrupt the results", async () => {
    expect(await ran(language, noisy, "solve", calls)).toEqual([
      { ok: true, value: 3 },
      { ok: true, value: 6 },
    ]);
  });

  test("a syntax error or a missing function is 'broken', with a message", async () => {
    expect(await runCalls(language, syntax, "solve", calls)).toMatchObject({ status: "broken", message: expect.stringMatching(/error/i) });
    expect(await runCalls(language, add, "other", calls)).toEqual({ status: "broken", message: "Define a function named other." });
  });

  test("an infinite loop hits the time limit", async () => {
    expect(await runCalls(language, loop, "solve", calls, { timeoutMs: 700 })).toMatchObject({ status: "failed", reason: "timeout" });
  });

  test("the solution sees no secrets from the server", async () => {
    process.env.BRAINROTNT_FAKE_SECRET = "s3cret-token";
    try {
      expect(await ran(language, leak, "solve", [[1, 2]])).toEqual([{ ok: true, value: "none" }]);
    } finally {
      delete process.env.BRAINROTNT_FAKE_SECRET;
    }
  });

  test.skipIf(!strict)("the solution has no network", async () => {
    expect(await ran(language, net, "solve", [[1, 2]])).toEqual([{ ok: true, value: "blocked" }]);
  });

  test("an unsafe entry name is refused before anything runs", async () => {
    expect(await runCalls(language, add, "solve(); evil", calls)).toMatchObject({ status: "broken" });
  });
});

describe("valuesMatch", () => {
  test("numbers allow rounding noise, everything else is exact", () => {
    expect(valuesMatch(0.3, 0.1 + 0.2)).toBe(true);
    expect(valuesMatch(1000000, 1000000.01)).toBe(false);
    expect(valuesMatch("3", 3)).toBe(false);
    expect(valuesMatch(true, 1)).toBe(false);
    expect(valuesMatch(null, 0)).toBe(false);
  });

  test("arrays and objects compare deeply and strictly", () => {
    expect(valuesMatch([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(valuesMatch([1, 2], [2, 1])).toBe(false);
    expect(valuesMatch([1, 2], [1, 2, 3])).toBe(false);
    expect(valuesMatch({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
    expect(valuesMatch({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(valuesMatch({ a: 1 }, [1])).toBe(false);
  });
});
