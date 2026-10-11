import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_PORT } from "./args";
import { findRunning } from "./lock";
import { claudeSkillDir, INSTALL_URL, luvusSocket, type Paths } from "./paths";
import { acceptsConnections } from "./ports";
import { removePathBlock } from "./shell-path";
import { bold, confirm, dim, fail, ok, run, warn } from "./ui";

/** `brnt doctor`: what works, what does not, and what to do about it. */
export async function doctor(paths: Paths, version: string): Promise<number> {
  const { getSandboxMode, sandboxWarning } = await import("../infra/sandbox-runner");
  const lines: string[] = [``, `  ${bold("brainrotnt")} ${dim(version)} ${dim(`· ${process.execPath}`)}`, ``];
  let problems = 0;
  const check = (good: boolean, yes: string, no: string, soft = false) => {
    if (!good && !soft) problems++;
    lines.push(`  ${good ? ok(yes) : soft ? warn(no) : fail(no)}`);
  };

  const onPath = Bun.which("brnt");
  check(!!onPath, `on PATH as brnt (${onPath})`, `brnt is not on PATH: open a new terminal, or add ${paths.bin} to PATH`, true);

  if (existsSync(paths.db)) {
    try {
      const sqlite = new Database(paths.db, { readonly: true });
      const count = (sqlite.query("select count(*) as n from problems where verification_status in ('verified', 'unverified')").get() as { n: number }).n;
      sqlite.close();
      const backups = existsSync(paths.backups) ? readdirSync(paths.backups).length : 0;
      check(true, `data: ${paths.db} (${(statSync(paths.db).size / 1024).toFixed(0)} kB, ${count} live problems, ${backups} backups)`, "");
    } catch (error) {
      check(false, "", `data: ${paths.db} could not be read (${error instanceof Error ? error.message : error})`);
    }
  } else check(true, "", `no data yet at ${paths.db}: it is created on the first start`, true);

  const python = Bun.which("python3");
  check(!!python, `python3 (${python})`, "python3 not found: Python code answers and new STEM problems cannot be checked", true);
  const sandbox = await getSandboxMode();
  const sandboxNote = sandboxWarning(sandbox);
  check(sandbox === "strict", "sandbox: isolated", `sandbox: ${sandboxNote}`, true);

  const socket = process.env.UHP_SOCKET_PATH || process.env.LUVUS_SOCKET_PATH || luvusSocket();
  check(existsSync(socket), `Luvus socket: ${socket}`, `Luvus socket not found at ${socket}: brainrotnt waits for it (set LUVUS_SOCKET_PATH if it lives elsewhere)`, true);

  const running = await findRunning(paths.lock);
  if (running) check(true, `running: http://localhost:${running.port} (pid ${running.pid}, ${running.version})`, "");
  else {
    const busy = await acceptsConnections(DEFAULT_PORT);
    check(!busy, `not running; port ${DEFAULT_PORT} is free`, `not running; port ${DEFAULT_PORT} is used by something else, so brainrotnt will pick another`, true);
  }

  if (Bun.which("claude")) {
    const { stdout } = await run(["claude", "mcp", "get", "brainrotnt"]);
    const url = stdout.match(/https?:\/\/\S+\/mcp/)?.[0];
    const want = `http://127.0.0.1:${running?.port ?? DEFAULT_PORT}/mcp`;
    check(url === want, `Claude Code MCP: ${url}`, url ? `Claude Code MCP points at ${url}, not ${want}: run brnt setup claude` : "Claude Code has no brainrotnt MCP server: run brnt setup claude", true);
    check(existsSync(claudeSkillDir()), `Claude Code skill: ${claudeSkillDir()}`, "the brainrotnt-problems skill is not installed: run brnt setup claude", true);
  } else lines.push(`  ${dim("- Claude Code not found (optional: it writes new problems for you)")}`);

  lines.push(``, problems ? `  ${problems} problem(s) found.` : `  ${ok("Ready.")}`, ``);
  console.log(lines.join("\n"));
  return problems ? 1 : 0;
}

/** `brnt setup claude`: register the MCP server for every project and install the authoring skill. */
export async function setupClaude(paths: Paths, skill: Record<string, string>): Promise<number> {
  if (!Bun.which("claude")) {
    console.error(`\n  ${fail("Claude Code (the claude command) was not found.")} Install it from https://claude.com/claude-code, then run brnt setup claude again.\n`);
    return 1;
  }
  const running = await findRunning(paths.lock);
  const url = `http://127.0.0.1:${running?.port ?? DEFAULT_PORT}/mcp`;

  // Replace any earlier registration (another port, another scope) rather than adding a second one.
  await run(["claude", "mcp", "remove", "brainrotnt", "-s", "user"]);
  const added = await run(["claude", "mcp", "add", "--transport", "http", "-s", "user", "brainrotnt", url]);
  if (added.code !== 0) {
    console.error(`\n  ${fail(`claude mcp add failed:`)} ${(added.stderr || added.stdout).trim()}\n`);
    return 1;
  }
  const project = await run(["claude", "mcp", "get", "brainrotnt"]);

  const dir = claudeSkillDir();
  rmSync(dir, { recursive: true, force: true });
  for (const [relative, text] of Object.entries(skill)) {
    const target = join(dir, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }

  console.log(
    [
      ``,
      `  ${ok(`MCP server registered for all projects: ${url}`)}`,
      `  ${ok(`Skill installed: ${dir}`)}`,
      project.stdout.includes(url) ? "" : `  ${warn("A project-level brainrotnt server with another URL may override it there; check with claude mcp list.")}`,
      ``,
      `  In Claude Code, try: ${bold('"use brainrotnt to add 5 stats problems on confidence intervals"')}`,
      running ? "" : dim(`  Start brainrotnt (brnt) before asking: the MCP server is part of it.`),
      ``,
    ]
      .filter((line, i, all) => line !== "" || all[i - 1] !== "")
      .join("\n"),
  );
  return 0;
}

/** `brnt update`: runs the installer again, which replaces the app and never touches data/. */
export async function update(paths: Paths, version: string, force: boolean): Promise<number> {
  const running = await findRunning(paths.lock);
  console.log(`\n  Updating brainrotnt (installed: ${version}) from ${INSTALL_URL}\n`);
  const proc = Bun.spawn(["sh", "-c", `curl -fsSL "$BRAINROTNT_INSTALL_URL" | sh`], {
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env, BRAINROTNT_INSTALL_URL: INSTALL_URL, BRAINROTNT_HOME: paths.home, BRAINROTNT_FORCE: force ? "1" : "", BRAINROTNT_FROM_UPDATE: "1" },
  });
  const code = await proc.exited;
  if (code === 0 && running) console.log(`  brainrotnt is still running the old version (pid ${running.pid}): quit it with q and run brnt again.\n`);
  return code;
}

const RC_FILES = [".zshrc", ".bashrc", ".bash_profile", ".profile"];
const FISH_FILE = join(".config", "fish", "conf.d", "brainrotnt.fish");

/** `brnt uninstall`: removes the app and its PATH lines; data stays unless --purge. */
export async function uninstall(paths: Paths, { purge, yes }: { purge: boolean; yes: boolean }): Promise<number> {
  const running = await findRunning(paths.lock);
  if (running) {
    console.error(`\n  ${fail(`brainrotnt is running (pid ${running.pid}).`)} Quit it first (q in its terminal).\n`);
    return 1;
  }
  const what = purge ? `the app and ALL your data in ${paths.home}` : `the app in ${paths.bin} (your data in ${paths.data} stays)`;
  if (!yes && !(await confirm(`  Remove ${what}?`, false))) {
    console.log("  Nothing removed.");
    return 1;
  }

  const home = homedir();
  const edited: string[] = [];
  for (const name of RC_FILES) {
    const file = join(home, name);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const cleaned = removePathBlock(text);
    if (cleaned !== text) {
      writeFileSync(file, cleaned);
      edited.push(file);
    }
  }
  if (existsSync(join(home, FISH_FILE))) {
    rmSync(join(home, FISH_FILE));
    edited.push(join(home, FISH_FILE));
  }
  rmSync(purge ? paths.home : paths.bin, { recursive: true, force: true });

  console.log(
    [
      ``,
      `  ${ok(`Removed ${purge ? paths.home : paths.bin}`)}`,
      ...edited.map((file) => `  ${ok(`Removed the PATH line from ${file}`)}`),
      purge ? "" : `  ${dim(`Your data is still in ${paths.data}; delete that folder to remove it too.`)}`,
      Bun.which("claude") ? `  ${dim("Claude Code still lists the brainrotnt MCP server: claude mcp remove brainrotnt -s user")}` : "",
      ``,
    ]
      .filter(Boolean)
      .join("\n") + "\n",
  );
  return 0;
}
