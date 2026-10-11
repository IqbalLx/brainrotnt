import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../../db/client";
import { problems } from "../../db/schema";
import { resetDb } from "../../test-support";

beforeEach(resetDb);

const CLI = join(import.meta.dir, "cli.ts");
const EXAMPLE = join(import.meta.dir, "../../../../../problems/example.yaml");

// DB_PATH points at the migrated temp database. Bun does not forward runtime changes to process.env, so pass it explicitly.
async function run(...args: string[]) {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], { stdout: "pipe", stderr: "pipe", cwd: tmpdir(), env: { ...process.env } });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { stdout, exitCode };
}

describe("import CLI", () => {
  test("imports from any directory, prints a report and exits 0", async () => {
    const { stdout, exitCode } = await run(EXAMPLE);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Imported 4 of 4 items (15 problems added); 0 rejected.");
    expect(await db.select().from(problems)).toHaveLength(15);
  });

  test("exits 1 when anything is rejected", async () => {
    const dir = await mkdtemp(join(tmpdir(), "brainrotnt-cli-"));
    const path = join(dir, "bad.yaml");
    await writeFile(path, "subject: math\n");
    const { stdout, exitCode } = await run(path);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("1 rejected");
  });

  test("with no files it prints usage and exits 1", async () => {
    const { stdout, exitCode } = await run();
    expect(exitCode).toBe(1);
    expect(stdout).toContain("Usage: bun run import");
  });
});
