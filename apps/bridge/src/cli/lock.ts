import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

/** Written while brainrotnt runs, so a second `brnt` finds it instead of starting another on the same data. */
export interface Lock {
  pid: number;
  port: number;
  version: string;
  network: boolean;
  startedAt: string;
}

export function readLock(path: string): Lock | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Lock;
  } catch {
    return null;
  }
}

export function writeLock(path: string, lock: Lock): void {
  writeFileSync(path, JSON.stringify(lock, null, 2));
}

/** Removes the lock only if it is ours, so quitting a stale process never deletes a live one's lock. */
export function releaseLock(path: string, pid = process.pid): void {
  if (readLock(path)?.pid === pid) rmSync(path, { force: true });
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === "EPERM";
  }
};

/** The running brainrotnt, checked by its health endpoint; a stale lock is cleaned up. */
export async function findRunning(path: string): Promise<Lock | null> {
  if (!existsSync(path)) return null;
  const lock = readLock(path);
  if (lock && alive(lock.pid)) {
    try {
      const res = await fetch(`http://127.0.0.1:${lock.port}/api/health`, { signal: AbortSignal.timeout(1500) });
      const body = (await res.json()) as { app?: string };
      if (body.app === "brainrotnt") return lock;
    } catch {
      // not answering: treat as gone
    }
  }
  rmSync(path, { force: true });
  return null;
}
