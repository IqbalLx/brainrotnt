import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where an installation lives. Everything is under one folder so updating replaces bin/ and never
 * touches data/:
 *   ~/.brainrotnt/bin/brainrotnt   the app (bin/brnt links to it)
 *   ~/.brainrotnt/data/            the database, its backups and the running-instance lock
 */
export function paths(home = process.env.BRAINROTNT_HOME || join(homedir(), ".brainrotnt")) {
  const data = join(home, "data");
  return {
    home,
    bin: join(home, "bin"),
    data,
    db: join(data, "brainrotnt.sqlite"),
    backups: join(data, "backups"),
    lock: join(data, "brainrotnt.lock"),
  };
}

export type Paths = ReturnType<typeof paths>;

export const luvusSocket = () => join(homedir(), ".luvus", "luvus.sock");
export const claudeSkillDir = () => join(homedir(), ".claude", "skills", "brainrotnt-problems");

export const REPO = "IqbalLx/brainrotnt";
export const INSTALL_URL = process.env.BRAINROTNT_INSTALL_URL || `https://raw.githubusercontent.com/${REPO}/main/install.sh`;
