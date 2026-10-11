import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

/** Drizzle's migration folder, as text: the journal and each migration's SQL by tag. */
export interface EmbeddedMigrations {
  journal: string;
  sql: Record<string, string>;
}

export type MigrationSource = { folder: string } | { embedded: EmbeddedMigrations };

export interface MigrateOptions {
  dbPath: string;
  source: MigrationSource;
  /** Where a copy of the database goes before pending migrations change it. */
  backupsDir: string;
  /** Names the backup, e.g. the version being upgraded to. */
  label: string;
  keepBackups?: number;
}

export interface MigrateResult {
  applied: number;
  backup: string | null;
}

/**
 * Brings the database up to date. When an existing database has migrations pending (an update),
 * it is first copied to `backupsDir` with VACUUM INTO, which gives a consistent snapshot even with
 * the WAL in use, and only the newest `keepBackups` copies are kept. A new database is not backed up.
 */
export function migrateDatabase({ dbPath, source, backupsDir, label, keepBackups = 3 }: MigrateOptions): MigrateResult {
  const folder = "folder" in source ? source.folder : writeEmbedded(source.embedded);
  try {
    const available = readMigrationFiles({ migrationsFolder: folder });
    const sqlite = new Database(dbPath, { create: true });
    try {
      const last = lastApplied(sqlite);
      const pending = available.filter((m) => last === null || m.folderMillis > last);
      let backup: string | null = null;
      if (pending.length > 0 && last !== null) {
        mkdirSync(backupsDir, { recursive: true });
        backup = join(backupsDir, `brainrotnt-${timestamp()}-before-${label.replace(/[^\w.-]/g, "_")}.sqlite`);
        sqlite.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
        pruneBackups(backupsDir, keepBackups);
      }
      if (pending.length > 0) migrate(drizzle(sqlite), { migrationsFolder: folder });
      return { applied: pending.length, backup };
    } finally {
      sqlite.close();
    }
  } finally {
    if (!("folder" in source)) rmSync(folder, { recursive: true, force: true });
  }
}

function lastApplied(sqlite: Database): number | null {
  const table = sqlite.query("select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'").get();
  if (!table) return null;
  const row = sqlite.query("select max(created_at) as last from __drizzle_migrations").get() as { last: number | null };
  return row.last === null ? null : Number(row.last);
}

// Drizzle's migrator reads a folder, so embedded migrations are written to a temporary one.
function writeEmbedded({ journal, sql }: EmbeddedMigrations): string {
  const dir = mkdtempSync(join(tmpdir(), "brainrotnt-migrations-"));
  mkdirSync(join(dir, "meta"));
  writeFileSync(join(dir, "meta", "_journal.json"), journal);
  for (const [tag, text] of Object.entries(sql)) writeFileSync(join(dir, `${tag}.sql`), text);
  return dir;
}

const timestamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/** Deletes all but the newest `keep` backups (names sort by their timestamp). */
export function pruneBackups(dir: string, keep: number): void {
  const backups = readdirSync(dir)
    .filter((name) => /^brainrotnt-.*\.sqlite$/.test(name))
    .sort();
  for (const name of backups.slice(0, Math.max(backups.length - keep, 0))) rmSync(join(dir, name), { force: true });
}
