// Copies every skill in skills/ into each harness folder listed in skills.sync.json.
// The repo is the source of truth: a target's copy of a skill is replaced, never merged.
// --check compares instead of copying (only targets marked "checked", the ones committed in the repo) and
// exits 1 on drift. --repo-only syncs just those, leaving folders outside the repo alone.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const config = JSON.parse(readFileSync(join(root, "skills.sync.json"), "utf8")) as {
  source: string;
  targets: { path: string; checked: boolean }[];
};
const check = process.argv.includes("--check");
const repoOnly = check || process.argv.includes("--repo-only");
const sourceDir = join(root, config.source);
const skills = readdirSync(sourceDir).filter((name) => statSync(join(sourceDir, name)).isDirectory());

const expand = (path: string) => (path.startsWith("~/") ? join(homedir(), path.slice(2)) : resolve(root, path));

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

let drift = 0;
for (const target of config.targets) {
  if (repoOnly && !target.checked) continue;
  const dir = expand(target.path);
  for (const skill of skills) {
    const from = join(sourceDir, skill);
    const to = join(dir, skill);
    if (check) {
      const want = files(from);
      const have = files(to);
      const differs =
        want.join("\n") !== have.join("\n") || want.some((file) => !readFileSync(join(from, file)).equals(readFileSync(join(to, file))));
      if (differs) {
        drift++;
        console.error(`${target.path}/${skill} is out of date: run scripts/sync-skills.sh`);
      }
      continue;
    }
    rmSync(to, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    cpSync(from, to, { recursive: true });
    console.log(`synced ${skill} -> ${target.path}`);
  }
}
if (check) {
  if (drift > 0) process.exit(1);
  console.log("skills are in sync");
}
