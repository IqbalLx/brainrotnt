import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const DB_PATH = process.env.DB_PATH ?? "./bridge.sqlite";

const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./drizzle" });
console.log(`Migrated ${DB_PATH}`);
