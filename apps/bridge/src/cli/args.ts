export const DEFAULT_PORT = 8787;

export type Command =
  | { name: "start"; port: number | null; network: boolean; open: boolean; allowRemoteCode: boolean; hosts: string[] }
  | { name: "doctor" }
  | { name: "setup-claude" }
  | { name: "setup-sandbox"; check: boolean }
  | { name: "update"; force: boolean }
  | { name: "uninstall"; purge: boolean; yes: boolean }
  | { name: "version" }
  | { name: "help" }
  | { name: "error"; message: string };

export const HELP = `brainrotnt: practise STEM problems while your coding agent works

Usage:
  brnt [options]           start brainrotnt and print its link (same as brainrotnt)
  brnt doctor              check the installation, Python, the sandbox, Luvus and Claude Code
  brnt setup claude        register the MCP server with Claude Code and install the problem skill
  brnt setup sandbox       on Linux, let brainrotnt isolate code answers where AppArmor blocks it (sudo)
  brnt update [--force]    install the latest release; your data is kept
  brnt uninstall [--purge] remove the app (--purge also deletes your data)
  brnt version             print the version

Options for starting:
  -p, --port <n>           use exactly this port (default: 8787, or the next free one)
  -n, --network            also serve on your local network, with an access key and a QR code
      --allow-remote-code  in network mode, let other devices run code answers on this machine
      --host <name>        in network mode, also answer to this address or name, e.g. a Tailscale IP or
                           MagicDNS name (repeatable; LAN addresses are found by themselves)
  -o, --open               open the browser right away
  -h, --help               show this help

Environment:
  BRAINROTNT_HOME          where data lives (default: ~/.brainrotnt)
  LUVUS_SOCKET_PATH        the Luvus socket (default: ~/.luvus/luvus.sock)
  BRAINROTNT_MACHINES      Luvus machines to follow over SSH: all (default), off, or ids like build,gpu
  BRAINROTNT_ALLOW_UNSANDBOXED=1  run reference and code answers without network isolation
`;

export function parseArgs(argv: string[]): Command {
  const [first, ...rest] = argv;
  switch (first) {
    case "doctor":
      return rest.length ? unexpected(rest[0]) : { name: "doctor" };
    case "setup":
      if (rest[0] === "claude" && rest.length === 1) return { name: "setup-claude" };
      // --check is for the command itself: it starts a new process to see whether a just-loaded profile works.
      if (rest[0] === "sandbox" && rest.slice(1).every((a) => a === "--check")) return { name: "setup-sandbox", check: rest.includes("--check") };
      return { name: "error", message: "usage: brnt setup claude | brnt setup sandbox" };
    case "update":
      return rest.every((a) => a === "--force") ? { name: "update", force: rest.includes("--force") } : unexpected(rest.find((a) => a !== "--force")!);
    case "uninstall": {
      const bad = rest.find((a) => a !== "--purge" && a !== "--yes" && a !== "-y");
      return bad ? unexpected(bad) : { name: "uninstall", purge: rest.includes("--purge"), yes: rest.includes("--yes") || rest.includes("-y") };
    }
    case "version":
    case "--version":
    case "-v":
      return { name: "version" };
    case "help":
      return { name: "help" };
  }

  const start: Extract<Command, { name: "start" }> = { name: "start", port: null, network: false, open: false, allowRemoteCode: false, hosts: [] };
  const args = first === "start" ? rest : argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") return { name: "help" };
    else if (arg === "-n" || arg === "--network") start.network = true;
    else if (arg === "-o" || arg === "--open") start.open = true;
    else if (arg === "--allow-remote-code") start.allowRemoteCode = true;
    else if (arg === "--host" || arg.startsWith("--host=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[++i];
      const host = hostName(value);
      if (!host) return { name: "error", message: `invalid host: ${value ?? "(missing)"} (a name or IP address, without a scheme or port)` };
      if (!start.hosts.includes(host)) start.hosts.push(host);
    } else if (arg === "-p" || arg === "--port" || arg.startsWith("--port=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : args[++i];
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return { name: "error", message: `invalid port: ${value ?? "(missing)"}` };
      start.port = port;
    } else return unexpected(arg);
  }
  if (start.allowRemoteCode && !start.network) return { name: "error", message: "--allow-remote-code only applies with --network" };
  if (start.hosts.length && !start.network) return { name: "error", message: "--host only applies with --network" };
  return start;
}

/**
 * A host name as the access check sees it (URL.hostname: lowercase, IPv6 in brackets), or null when the
 * value is not a bare host: no scheme, port, path or credentials.
 */
function hostName(value: string | undefined): string | null {
  if (!value || /[/@?#\s]/.test(value)) return null;
  const literal = value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
  try {
    const url = new URL(`http://${literal}/`);
    return url.port === "" && url.hostname ? url.hostname : null;
  } catch {
    return null;
  }
}

const unexpected = (arg: string): Command => ({ name: "error", message: `unknown argument: ${arg} (see brnt --help)` });
