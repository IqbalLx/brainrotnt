// `bun run brnt -- [args]`: the installed command, run from a source checkout. It serves apps/web/dist
// (build it first with `bun run --filter web build`) and reads the migrations and skill from disk.
// Use BRAINROTNT_HOME to keep its data away from a real installation.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { assetsFromDirectory } from "../infra/static-assets";
import { run } from "./main";

const root = join(import.meta.dir, "../../../..");
const skillDir = join(root, "skills/brainrotnt-problems");
const skill: Record<string, string> = {};
for await (const relative of new Bun.Glob("**/*").scan({ cwd: skillDir, onlyFiles: true })) {
  skill[relative] = await Bun.file(join(skillDir, relative)).text();
}

// Missing until the web app is built; commands such as `mcp` do not need it.
const webDist = join(root, "apps/web/dist");

await run({
  version: "dev",
  webAssets: existsSync(webDist) ? await assetsFromDirectory(webDist) : new Map(),
  migrations: { folder: join(root, "apps/bridge/drizzle") },
  skill,
});
