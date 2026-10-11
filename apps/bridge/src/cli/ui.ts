// Terminal output helpers: colour only on a TTY and never with NO_COLOR.
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (open: number, close: number) => (text: string) => (color ? `\x1b[${open}m${text}\x1b[${close}m` : text);

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const cyan = wrap(36, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const red = wrap(31, 39);

export const ok = (text: string) => `${green("✓")} ${text}`;
export const warn = (text: string) => `${yellow("!")} ${text}`;
export const fail = (text: string) => `${red("✗")} ${text}`;

/** Opens a URL in the default browser; false when there is no opener on this system. */
export function openInBrowser(url: string): boolean {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? null : "xdg-open";
  if (!opener || !Bun.which(opener)) return false;
  Bun.spawn([opener, url], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref();
  return true;
}

/** Asks a yes/no question on the terminal; `fallback` when there is no terminal to ask on. */
export async function confirm(question: string, fallback = false): Promise<boolean> {
  if (!process.stdin.isTTY) return fallback;
  process.stdout.write(`${question} ${fallback ? "[Y/n]" : "[y/N]"} `);
  for await (const line of console) {
    const answer = line.trim().toLowerCase();
    return answer === "" ? fallback : answer === "y" || answer === "yes";
  }
  return fallback;
}

/** Runs a command and returns its exit code and output, without throwing when it is missing. */
export async function run(command: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const proc = Bun.spawn(command, { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { code, stdout, stderr };
  } catch (error) {
    return { code: 127, stdout: "", stderr: String(error) };
  }
}
