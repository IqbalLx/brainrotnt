import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * Runs untrusted Python or JavaScript (reference solutions and generators written by an AI agent,
 * possibly from injected source material, and code a student submits) in a subprocess with a time limit, resource limits, a scrubbed
 * environment, an empty working directory and, where the OS allows, no network.
 *
 * Network isolation uses a Linux network namespace (`unshare -rn`). Where it is unavailable the
 * runner fails closed; set BRAINROTNT_ALLOW_UNSANDBOXED=1 to run with limits but WITHOUT network
 * isolation, which means trusting whatever code you submit.
 */

export interface SandboxOptions {
  timeoutMs?: number;
  /** Address-space limit (`ulimit -v`). 0 turns it off. */
  memoryMb?: number;
  maxOutputBytes?: number;
  /** CPU-time backstop (`ulimit -t`). Defaults to a second past the wall-clock limit. */
  cpuSeconds?: number;
}

export type Language = "python" | "javascript";

export interface Program {
  language: Language;
  /** Files written to the empty working directory, by name. */
  files: Record<string, string>;
  /** The file to execute; it must be one of `files`. */
  main: string;
}

export type SandboxFailure = "timeout" | "output_too_large" | "nonzero_exit" | "sandbox_unavailable" | "spawn_failed";

export type SandboxResult =
  | { ok: true; stdout: string; durationMs: number }
  | { ok: false; reason: SandboxFailure; message: string; stderr: string; durationMs: number };

export type SandboxMode = "strict" | "unsandboxed-allowed" | "unavailable";

const DEFAULTS = { timeoutMs: 5000, memoryMb: 512, maxOutputBytes: 64 * 1024 };
const STDERR_LIMIT = 4096;

let probe: Promise<SandboxMode> | null = null;

async function succeeds(command: string[]): Promise<boolean> {
  try {
    const proc = Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

// Overridable so tests can exercise the fail-closed path on a machine that does have `unshare`.
const unshareBin = () => process.env.BRAINROTNT_UNSHARE_BIN ?? "unshare";

export function getSandboxMode(): Promise<SandboxMode> {
  probe ??= (async () => {
    if (!Bun.which("python3")) return "unavailable";
    if (await succeeds([unshareBin(), "-rn", "--", "true"])) return "strict";
    return process.env.BRAINROTNT_ALLOW_UNSANDBOXED === "1" ? "unsandboxed-allowed" : "unavailable";
  })();
  return probe;
}

/** What to tell the person when reference and code answers cannot run isolated; null when they can. */
export function sandboxWarning(mode: SandboxMode): string | null {
  if (mode === "unavailable") {
    return Bun.which("python3")
      ? "network isolation is unavailable: reference solutions and code answers will not run. Set BRAINROTNT_ALLOW_UNSANDBOXED=1 to run them without it."
      : "python3 was not found: reference solutions and Python code answers will not run.";
  }
  if (mode === "unsandboxed-allowed") return "running reference solutions and code answers WITHOUT network isolation (BRAINROTNT_ALLOW_UNSANDBOXED=1).";
  return null;
}

// Test hook: forget the cached probe so a changed environment is re-read.
export function resetSandboxProbe(): void {
  probe = null;
}

// The wall-clock timer decides timeouts. The CPU limit is only a backstop if this process stalls, so it
// sits a second past the timer: equal limits race, and a kill by the kernel used to read as a crash.
function limitsScript(memoryMb: number, cpuSeconds: number): string {
  // Each limit is best effort: `ulimit -v` is not supported everywhere (macOS), so a failure is not fatal.
  return [
    `ulimit -t ${cpuSeconds} 2>/dev/null`,
    memoryMb > 0 ? `ulimit -v ${memoryMb * 1024} 2>/dev/null` : "true",
    "ulimit -f 2048 2>/dev/null",
    "ulimit -n 64 2>/dev/null",
    "ulimit -c 0 2>/dev/null",
    "true",
  ].join("; ");
}

async function readCapped(stream: ReadableStream<Uint8Array>, limit: number, onOverflow: () => void): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size > limit) {
      onOverflow();
      break;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function runPython(code: string, options: SandboxOptions = {}): Promise<SandboxResult> {
  return runProgram({ language: "python", files: { "main.py": code }, main: "main.py" }, options);
}

export async function runProgram(program: Program, options: SandboxOptions = {}): Promise<SandboxResult> {
  const javascript = program.language === "javascript";
  const { timeoutMs, memoryMb, maxOutputBytes } = { ...DEFAULTS, ...options };
  const cpuSeconds = options.cpuSeconds ?? Math.ceil(timeoutMs / 1000) + 1;
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const fail = (reason: SandboxFailure, message: string, stderr = ""): SandboxResult => ({
    ok: false,
    reason,
    message,
    stderr,
    durationMs: elapsed(),
  });

  const mode = await getSandboxMode();
  if (mode === "unavailable") {
    return fail(
      "sandbox_unavailable",
      "Cannot isolate the network for untrusted code on this machine (needs Linux with `unshare` and python3). " +
        "Set BRAINROTNT_ALLOW_UNSANDBOXED=1 to run reference code without network isolation.",
    );
  }

  // The server's own Bun runs JavaScript, so there is nothing extra to install. In the compiled brnt
  // binary execPath is brnt itself, which BUN_BE_BUN (below) turns back into Bun.
  const interpreter = javascript ? process.execPath : (Bun.which("python3") as string);
  const flags = javascript ? '--no-install "$1"' : '-I -B "$1"';
  const dir = await mkdtemp(join(tmpdir(), "brainrotnt-sandbox-"));
  try {
    for (const [name, content] of Object.entries(program.files)) await writeFile(join(dir, name), content, "utf8");
    const script = `${limitsScript(memoryMb, cpuSeconds)}; exec "$0" ${flags}`;
    const command = ["sh", "-c", script, interpreter, program.main];
    if (mode === "strict") command.unshift(unshareBin(), "-rn", "--");

    let timedOut = false;
    let overflowed = false;
    const proc = Bun.spawn(command, {
      cwd: dir,
      // Nothing from the parent's environment (tokens, paths, proxies) reaches the code.
      env: {
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONHASHSEED: "0",
        // Bun wants a writable home for its caches; the empty working directory is the only one it gets.
        // BUN_BE_BUN makes a compiled brnt binary act as plain Bun instead of parsing brnt's own arguments.
        ...(javascript ? { HOME: dir, TMPDIR: dir, BUN_BE_BUN: "1" } : {}),
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);
    const onOverflow = () => {
      overflowed = true;
      proc.kill("SIGKILL");
    };

    const [stdout, stderr, exitCode] = await Promise.all([
      readCapped(proc.stdout, maxOutputBytes, onOverflow),
      readCapped(proc.stderr, STDERR_LIMIT, () => {}),
      proc.exited,
    ]);
    clearTimeout(timer);

    // The CPU backstop ends the process with SIGXCPU or, when it is also the hard limit, SIGKILL. Neither
    // is a crash in the code: the only other SIGKILLs come from this runner, flagged above.
    const cpuKilled = !overflowed && (proc.signalCode === "SIGXCPU" || proc.signalCode === "SIGKILL");
    if (timedOut || cpuKilled) return fail("timeout", `Timed out after ${timeoutMs} ms`, stderr);
    if (overflowed) return fail("output_too_large", `Output exceeded ${maxOutputBytes} bytes`, stderr);
    if (exitCode !== 0) return fail("nonzero_exit", `Exited with code ${exitCode}`, stderr);
    return { ok: true, stdout, durationMs: elapsed() };
  } catch (error) {
    return fail("spawn_failed", error instanceof Error ? error.message : String(error));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
