import { afterEach, describe, expect, test } from "bun:test";
import { getSandboxMode, resetSandboxProbe, runPython } from "./sandbox-runner";

const run = (code: string, options = {}) => runPython(code, { timeoutMs: 3000, ...options });

describe("sandbox runner", () => {
  test("runs python and returns stdout", async () => {
    expect(await getSandboxMode()).toBe("strict");
    const result = await run("print(6 * 7)");
    expect(result).toMatchObject({ ok: true, stdout: "42\n" });
  });

  test("python errors are reported with their stderr", async () => {
    const result = await run("raise ValueError('boom')");
    expect(result).toMatchObject({ ok: false, reason: "nonzero_exit" });
    expect(!result.ok && result.stderr).toContain("ValueError: boom");
  });

  test("an infinite loop is killed at the time limit", async () => {
    const started = performance.now();
    const result = await run("while True: pass", { timeoutMs: 600 });
    expect(result).toMatchObject({ ok: false, reason: "timeout" });
    expect(performance.now() - started).toBeLessThan(2500);
  });

  test("runaway output is cut off", async () => {
    const result = await run("while True: print('x' * 1000)", { maxOutputBytes: 10_000 });
    expect(result).toMatchObject({ ok: false, reason: "output_too_large" });
  });

  test("memory is limited", async () => {
    const result = await run("x = bytearray(2 * 1024 * 1024 * 1024)", { memoryMb: 256 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.stderr).toContain("MemoryError");
  });

  test("large file writes are refused", async () => {
    const result = await run("open('big.bin', 'wb').write(b'x' * 50_000_000)");
    expect(result.ok).toBe(false);
  });

  test("there is no network", async () => {
    const result = await run(`
import socket
try:
    socket.create_connection(("1.1.1.1", 53), timeout=2)
    print("REACHED")
except OSError as e:
    print("blocked", e.errno)
`);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.stdout).not.toContain("REACHED");
    // ENETUNREACH (101) is what an empty network namespace returns. A host connection that merely
    // fails (a firewall, a proxy) gives a different error, so this proves the isolation itself.
    expect(result.ok && result.stdout.trim()).toBe("blocked 101");
  });

  test("the parent's environment does not leak in", async () => {
    process.env.BRAINROTNT_FAKE_SECRET = "s3cret-token";
    try {
      const result = await run("import os; print(sorted(os.environ))");
      expect(result.ok && result.stdout).not.toContain("BRAINROTNT_FAKE_SECRET");
      expect(result.ok && result.stdout).not.toContain("HOME");
    } finally {
      delete process.env.BRAINROTNT_FAKE_SECRET;
    }
  });

  test("it starts in an empty temp directory, removed afterwards", async () => {
    const result = await run("import os; print(os.getcwd()); print(sorted(os.listdir('.')))");
    expect(result.ok).toBe(true);
    const [cwd, listing] = (result.ok ? result.stdout : "").trim().split("\n");
    expect(listing).toBe("['main.py']");
    expect(await Bun.file(cwd).exists()).toBe(false);
  });
});

describe("when isolation is unavailable", () => {
  afterEach(() => {
    delete process.env.BRAINROTNT_UNSHARE_BIN;
    delete process.env.BRAINROTNT_ALLOW_UNSANDBOXED;
    resetSandboxProbe();
  });

  test("it fails closed and never runs the code", async () => {
    process.env.BRAINROTNT_UNSHARE_BIN = "/nonexistent/unshare";
    resetSandboxProbe();
    expect(await getSandboxMode()).toBe("unavailable");
    const result = await run("print('should not run')");
    expect(result).toMatchObject({ ok: false, reason: "sandbox_unavailable" });
    expect(!result.ok && result.message).toContain("BRAINROTNT_ALLOW_UNSANDBOXED");
  });

  test("without the namespace the same connection fails differently, so the strict test is meaningful", async () => {
    process.env.BRAINROTNT_UNSHARE_BIN = "/nonexistent/unshare";
    process.env.BRAINROTNT_ALLOW_UNSANDBOXED = "1";
    resetSandboxProbe();
    const result = await run('import socket\ntry:\n    socket.create_connection(("1.1.1.1", 53), timeout=2); print("REACHED")\nexcept OSError as e:\n    print("blocked", e.errno)');
    expect(result.ok && result.stdout.trim()).not.toBe("blocked 101");
  });

  test("an explicit opt-in runs it with limits but without network isolation", async () => {
    process.env.BRAINROTNT_UNSHARE_BIN = "/nonexistent/unshare";
    process.env.BRAINROTNT_ALLOW_UNSANDBOXED = "1";
    resetSandboxProbe();
    expect(await getSandboxMode()).toBe("unsandboxed-allowed");
    expect(await run("print('ok')")).toMatchObject({ ok: true, stdout: "ok\n" });
  });
});
