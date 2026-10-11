// The `brainrotnt` / `brnt` command. The release build (scripts/build-release.ts) generates an entry that
// embeds the web app, the migrations and the skill, then calls run(); dev.ts does the same from disk.
import type { MigrationSource } from "../db/migrations";
import type { StaticAssets } from "../infra/static-assets";
import { HELP, parseArgs } from "./args";
import { doctor, setupClaude, uninstall, update } from "./commands";
import { paths } from "./paths";
import { setupSandbox } from "./sandbox-setup";
import { start } from "./start";
import { red } from "./ui";

export interface Embedded {
  version: string;
  webAssets: StaticAssets;
  migrations: MigrationSource;
  /** The brainrotnt-problems skill, relative path to text, for `brnt setup claude`. */
  skill: Record<string, string>;
}

export async function run(embedded: Embedded, argv = process.argv.slice(2)): Promise<never> {
  const command = parseArgs(argv);
  const where = paths();
  let code: number;
  switch (command.name) {
    case "start":
      code = await start(command, { paths: where, version: embedded.version, webAssets: embedded.webAssets, migrations: embedded.migrations });
      break;
    case "doctor":
      code = await doctor(where, embedded.version);
      break;
    case "setup-claude":
      code = await setupClaude(where, embedded.skill);
      break;
    case "setup-sandbox":
      code = await setupSandbox(command);
      break;
    case "update":
      code = await update(where, embedded.version, command.force);
      break;
    case "uninstall":
      code = await uninstall(where, command);
      break;
    case "version":
      console.log(embedded.version);
      code = 0;
      break;
    case "help":
      console.log(HELP);
      code = 0;
      break;
    case "error":
      console.error(red(command.message));
      code = 2;
      break;
  }
  process.exit(code);
}
