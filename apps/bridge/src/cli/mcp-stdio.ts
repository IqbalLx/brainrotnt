import { mkdirSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { migrateDatabase, type MigrationSource } from "../db/migrations";
import type { Paths } from "./paths";

/**
 * `brnt mcp`: the MCP tools over stdin/stdout, for clients that launch a command (Claude Desktop) rather
 * than call a URL. It opens the database itself, so the app does not have to be running; SQLite's WAL lets
 * both work on it at once. Resolves when the client closes the connection.
 */
export async function mcpStdio({ paths, version, migrations }: { paths: Paths; version: string; migrations: MigrationSource }): Promise<number> {
  // stdout carries the protocol, so anything a module logs goes to stderr instead.
  console.log = console.info = console.debug = (...args) => console.error(...args);

  mkdirSync(paths.data, { recursive: true });
  // Before anything imports the database client, which opens DB_PATH as it loads.
  process.env.DB_PATH = paths.db;
  try {
    const { backup } = migrateDatabase({ dbPath: paths.db, source: migrations, backupsDir: paths.backups, label: version });
    if (backup) console.error(`brainrotnt: backed up the database to ${backup} before updating it`);
  } catch (error) {
    console.error(`brainrotnt: could not update the database at ${paths.db}: ${error instanceof Error ? error.message : error}`);
    return 1;
  }

  const { createMcpServer } = await import("../mcp/server");
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  const closed = new Promise<void>((resolve) => (transport.onclose = resolve));
  process.stdin.on("end", () => void server.close());
  await server.connect(transport);
  await closed;
  return 0;
}
