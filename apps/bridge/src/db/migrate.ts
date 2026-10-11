// `bun run db:migrate`: brings the development database up to date, backing it up first when it
// already has data and migrations are pending (see migrations.ts). The installed app does the same on start.
import { dirname, join } from "node:path";
import { migrateDatabase } from "./migrations";

const DB_PATH = process.env.DB_PATH ?? "./bridge.sqlite";
const { applied, backup } = migrateDatabase({
  dbPath: DB_PATH,
  source: { folder: "./drizzle" },
  backupsDir: join(dirname(DB_PATH), "backups"),
  label: "dev",
});
if (backup) console.log(`Backed up to ${backup}`);
console.log(`Migrated ${DB_PATH} (${applied} applied)`);
