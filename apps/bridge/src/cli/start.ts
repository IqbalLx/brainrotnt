import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { renderUnicodeCompact } from "uqr";
import { migrateDatabase, type MigrationSource } from "../db/migrations";
import type { StaticAssets } from "../infra/static-assets";
import { DEFAULT_PORT, type Command } from "./args";
import { findRunning, releaseLock, writeLock } from "./lock";
import { lanAddresses } from "./network";
import { luvusSocket, type Paths } from "./paths";
import { listenOnFreePort, PortInUseError } from "./ports";
import type { UhpDebugSnapshot } from "../infra/uhp-client";
import { bold, cyan, dim, green, openInBrowser, red, yellow } from "./ui";

export interface StartContext {
  paths: Paths;
  version: string;
  webAssets: StaticAssets;
  migrations: MigrationSource;
}

type StartOptions = Extract<Command, { name: "start" }>;

export async function start(options: StartOptions, { paths, version, webAssets, migrations }: StartContext): Promise<number> {
  mkdirSync(paths.data, { recursive: true });

  const running = await findRunning(paths.lock);
  if (running) {
    const url = `http://localhost:${running.port}`;
    console.log(`\n  brainrotnt ${running.version} is already running (pid ${running.pid}).\n\n  ${bold("Local:")}  ${cyan(url)}\n`);
    if (running.network) console.log(dim("  It was started with --network; its network link is in that terminal.\n"));
    if (options.open || (await waitForEnter("  Press Enter to open it in your browser, or Ctrl+C to leave.")) === "enter") openInBrowser(url);
    return 0;
  }

  // Before anything imports the database client, which opens DB_PATH as it loads.
  process.env.DB_PATH = paths.db;
  const fresh = !existsSync(paths.db);
  try {
    const { backup } = migrateDatabase({ dbPath: paths.db, source: migrations, backupsDir: paths.backups, label: version });
    if (backup) console.log(dim(`  Backed up your data to ${backup} before updating the database.`));
  } catch (error) {
    console.error(red(`\n  Could not update the database at ${paths.db}:\n  ${error instanceof Error ? error.message : error}\n`));
    console.error(`  Your previous data is in ${paths.backups} if a backup was made. Please report this at https://github.com/IqbalLx/brainrotnt/issues\n`);
    return 1;
  }

  const [{ createApp }, { localOnly }, { networkAccess }, sandboxModule, { createUhpClient }] = await Promise.all([
    import("../app"),
    import("../infra/local-only"),
    import("../infra/access"),
    import("../infra/sandbox-runner"),
    import("../infra/uhp-client"),
  ]);

  if (fresh || (await bankIsEmpty())) {
    process.stdout.write(dim("  Loading the starter problems… "));
    const { seedStarterProblems } = await import("../db/seed");
    const { inserted } = await seedStarterProblems();
    console.log(dim(`${inserted} added.`));
  }

  const sandbox = await sandboxModule.getSandboxMode();
  const uhpClient = createUhpClient({ mockWhenUnset: false, defaultSocketPath: luvusSocket() });
  await uhpClient.start();

  // --host adds names lanAddresses() leaves out on purpose, such as a Tailscale address; they follow the LAN ones, so the QR code stays the Wi-Fi link.
  const addresses = options.network ? [...new Set([...lanAddresses(), ...options.hosts])] : [];
  const key = randomBytes(18).toString("base64url");
  const access = options.network ? networkAccess({ key, hosts: addresses, allowRemoteCode: options.allowRemoteCode }) : localOnly;
  const app = createApp({ uhpClient, sandbox, version, access, webAssets });

  let server;
  try {
    server = await listenOnFreePort({
      start: options.port ?? DEFAULT_PORT,
      strict: options.port !== null,
      hostname: options.network ? "0.0.0.0" : "127.0.0.1",
      fetch: app.fetch,
    });
  } catch (error) {
    uhpClient.stop();
    if (error instanceof PortInUseError) {
      console.error(red(`\n  ${error.message}.`) + (options.port ? " Choose another with --port, or leave it out to pick a free one.\n" : "\n"));
      return 1;
    }
    throw error;
  }
  const port = server.port!;
  writeLock(paths.lock, { pid: process.pid, port, version, network: options.network, startedAt: new Date().toISOString() });

  const local = `http://localhost:${port}`;
  const networkUrls = addresses.map((address) => `http://${address}:${port}/?key=${key}`);
  await settleAgent(uhpClient);
  printBanner({ version, port, local, networkUrls, options, sandbox, agent: agentLine(uhpClient), db: paths.db });

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log(dim("\n  Stopping brainrotnt…"));
    uhpClient.stop();
    server.stop(true);
    releaseLock(paths.lock);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop);

  if (options.open) openInBrowser(local);
  listenForKeys({ onEnter: () => openInBrowser(local) || console.log(`  Open ${local} in your browser.`), onQuit: stop });
  return new Promise<number>(() => {}); // runs until stopped
}

async function bankIsEmpty(): Promise<boolean> {
  const { db } = await import("../db/client");
  const { problems } = await import("../db/schema");
  return (await db.select({ id: problems.id }).from(problems).limit(1)).length === 0;
}

// Give the first connection attempt to Luvus a moment, so the banner says whether it worked.
async function settleAgent(client: { debug(): { connection: string } }) {
  for (let i = 0; i < 10 && client.debug().connection === "connecting"; i++) await Bun.sleep(50);
}

function agentLine(client: { debug(): UhpDebugSnapshot }): string {
  const { connection, socketPath, sources, machines } = client.debug();
  const local =
    connection === "subscribed"
      ? `${green("connected")} ${dim(`· Luvus · ${socketPath}`)}`
      : `${yellow("waiting for Luvus")} ${dim(`· ${socketPath} · it connects by itself once Luvus runs`)}`;
  const remotes = sources.filter((source) => source.machine !== null);
  if (remotes.length === 0) return machines && !machines.startsWith("none") ? `${local}\n  ${dim("machines")}  ${dim(machines)}` : local;
  // SSH takes longer than the banner waits, so a machine still connecting is normal here.
  const list = remotes.map((source) => (source.connection === "subscribed" ? green(source.name) : `${source.name} ${dim(`(${source.connection})`)}`));
  return `${local}\n  ${dim("machines")}  ${list.join(dim(", "))} ${dim("· over SSH")}`;
}

const SANDBOX_LINE: Record<string, string> = {
  strict: green("isolated"),
  "unsandboxed-allowed": `${yellow("not isolated")} ${dim("· BRAINROTNT_ALLOW_UNSANDBOXED=1")}`,
  unavailable: `${yellow("unavailable")} ${dim("· code answers and new problems cannot run here; see brnt doctor")}`,
};

function printBanner({
  version,
  port,
  local,
  networkUrls,
  options,
  sandbox,
  agent,
  db,
}: {
  version: string;
  port: number;
  local: string;
  networkUrls: string[];
  options: StartOptions;
  sandbox: string;
  agent: string;
  db: string;
}) {
  const arrow = cyan("➜");
  const lines = [``, `  ${bold("brainrotnt")} ${dim(version)}`, ``, `  ${arrow}  ${bold("Local:")}    ${cyan(local)}`];
  if (!options.network) lines.push(`  ${arrow}  ${bold("Network:")}  ${dim("off · brnt --network to open it to your local network")}`);
  else if (networkUrls.length === 0) lines.push(`  ${arrow}  ${bold("Network:")}  ${yellow("no local network address found")}`);
  else for (const url of networkUrls) lines.push(`  ${arrow}  ${bold("Network:")}  ${cyan(url)}`);
  const mcp = `http://127.0.0.1:${port}/mcp`;
  lines.push(`  ${arrow}  ${bold("MCP:")}      ${mcp}${port === DEFAULT_PORT ? "" : yellow(`  (not ${DEFAULT_PORT}: run brnt setup claude to point Claude Code here)`)}`);
  lines.push(``, `  ${dim("agent  ")}  ${agent}`, `  ${dim("sandbox")}  ${SANDBOX_LINE[sandbox] ?? sandbox}`, `  ${dim("data   ")}  ${dim(db)}`);
  if (port !== (options.port ?? DEFAULT_PORT)) lines.push(``, yellow(`  Port ${DEFAULT_PORT} was busy, so brainrotnt is on ${port}.`));

  if (options.network && networkUrls.length > 0) {
    lines.push(
      ``,
      yellow("  Anyone on this network with the link can practise here and see your history. The key changes each start."),
      options.allowRemoteCode
        ? yellow("  --allow-remote-code: code answers from other devices run on this machine.")
        : dim("  Code answers from other devices are off (--allow-remote-code turns them on)."),
      ``,
      dim(`  Scan to open ${networkUrls[0].replace(/\?key=.*/, "")} on your phone:`),
      ``,
      ...renderUnicodeCompact(networkUrls[0], { border: 1 })
        .split("\n")
        .map((row) => `    ${row}`),
    );
  }
  lines.push(``, process.stdin.isTTY ? `  ${bold("Enter")} opens it in your browser · ${bold("q")} quits` : dim("  Ctrl+C quits"), ``);
  console.log(lines.join("\n"));
}

function listenForKeys({ onEnter, onQuit }: { onEnter: () => void; onQuit: () => void }) {
  if (!process.stdin.isTTY) return;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk: Buffer) => {
    for (const ch of chunk.toString()) {
      if (ch === "\r" || ch === "\n") onEnter();
      else if (ch === "q" || ch === "Q" || ch === "\u0003" || ch === "\u0004") onQuit();
    }
  });
}

/** For the already-running case: waits for Enter (or gives up on Ctrl+C or without a terminal). */
function waitForEnter(prompt: string): Promise<"enter" | "quit"> {
  if (!process.stdin.isTTY) return Promise.resolve("quit");
  console.log(prompt);
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (chunk: Buffer) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      const ch = chunk.toString();
      resolve(ch === "\r" || ch === "\n" ? "enter" : "quit");
    });
  });
}
