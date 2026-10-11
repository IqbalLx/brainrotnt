import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateDatabase, pruneBackups } from "./migrations";

const DRIZZLE = join(import.meta.dir, "../../drizzle");
const journal = JSON.parse(readFileSync(join(DRIZZLE, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "brainrotnt-migrate-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// A copy of the migrations folder holding only the first `count`, as an older release would have.
function olderRelease(count: number): string {
  const folder = join(dir, `release-${count}`);
  mkdirSync(join(folder, "meta"), { recursive: true });
  for (const { tag } of journal.entries.slice(0, count)) cpSync(join(DRIZZLE, `${tag}.sql`), join(folder, `${tag}.sql`));
  writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, count) }));
  return folder;
}

const embedded = () => ({
  journal: readFileSync(join(DRIZZLE, "meta/_journal.json"), "utf8"),
  sql: Object.fromEntries(journal.entries.map(({ tag }) => [tag, readFileSync(join(DRIZZLE, `${tag}.sql`), "utf8")])),
});

describe("migrateDatabase", () => {
  test("creates a new database without a backup", () => {
    const dbPath = join(dir, "new.sqlite");
    const result = migrateDatabase({ dbPath, source: { embedded: embedded() }, backupsDir: join(dir, "backups"), label: "v1" });
    expect(result).toEqual({ applied: journal.entries.length, backup: null });
    expect(existsSync(join(dir, "backups"))).toBe(false);
  });

  test("an update backs up first, applies only what is new, and keeps the data", () => {
    const dbPath = join(dir, "bank.sqlite");
    const backupsDir = join(dir, "backups");
    expect(migrateDatabase({ dbPath, source: { folder: olderRelease(2) }, backupsDir, label: "v1" }).applied).toBe(2);
    const db = new Database(dbPath);
    db.run("insert into problems (id, version, subject, topic, difficulty, type, statement, statement_hash, answer, tools, verification_status, created_at) values ('p1', 1, 'math', 't', 1, 'numeric', 's', 'h', '{}', '{}', 'verified', 0)");
    db.close();

    const result = migrateDatabase({ dbPath, source: { embedded: embedded() }, backupsDir, label: "v2" });
    expect(result.applied).toBe(journal.entries.length - 2);
    expect(result.backup).toContain("before-v2");
    const backup = new Database(result.backup!, { readonly: true });
    expect(backup.query("select id from problems").all()).toEqual([{ id: "p1" }]);
    backup.close();
    const after = new Database(dbPath, { readonly: true });
    expect(after.query("select id from problems").all()).toEqual([{ id: "p1" }]);
    after.close();

    // Running the same release again changes nothing and makes no new backup.
    expect(migrateDatabase({ dbPath, source: { embedded: embedded() }, backupsDir, label: "v2" })).toEqual({ applied: 0, backup: null });
    expect(readdirSync(backupsDir)).toHaveLength(1);
  });
});

describe("pruneBackups", () => {
  test("keeps the newest copies only", () => {
    for (const stamp of ["20260101T000000Z", "20260201T000000Z", "20260301T000000Z", "20260401T000000Z"]) {
      writeFileSync(join(dir, `brainrotnt-${stamp}-before-v.sqlite`), "");
    }
    writeFileSync(join(dir, "notes.txt"), "");
    pruneBackups(dir, 3);
    expect(readdirSync(dir).sort()).toEqual([
      "brainrotnt-20260201T000000Z-before-v.sqlite",
      "brainrotnt-20260301T000000Z-before-v.sqlite",
      "brainrotnt-20260401T000000Z-before-v.sqlite",
      "notes.txt",
    ]);
  });
});
