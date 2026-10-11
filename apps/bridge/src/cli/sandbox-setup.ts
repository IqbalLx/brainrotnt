import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { appArmorRestrictsUserNamespaces, getSandboxMode } from "../infra/sandbox-runner";
import { bold, dim, fail, ok, warn } from "./ui";

/*
 * The sandbox cuts untrusted code off the network with an unprivileged user namespace (`unshare -rn`).
 * Ubuntu 23.10 and later deny those through AppArmor unless a profile allows them, so this writes a
 * profile for the brainrotnt binary alone, the way Ubuntu ships them for Chrome and VS Code. The
 * `unshare` it starts inherits the profile. Turning the restriction off system-wide would also work,
 * but it would lift it for every program.
 */

export const APPARMOR_PROFILE = "/etc/apparmor.d/brainrotnt";

export function appArmorProfile(binary: string): string {
  return [
    "# Written by brainrotnt (brnt setup sandbox). Lets this one binary create the unprivileged user",
    "# namespace its code sandbox uses to cut off the network. Delete this file to undo it.",
    "abi <abi/4.0>,",
    "include <tunables/global>",
    "",
    `profile brainrotnt ${JSON.stringify(binary)} flags=(unconfined) {`,
    "  userns,",
    "",
    "  include if exists <local/brainrotnt>",
    "}",
    "",
  ].join("\n");
}

async function sudo(args: string[]): Promise<boolean> {
  try {
    // Inherited so sudo can ask for the password on the terminal.
    const proc = Bun.spawn(["sudo", ...args], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

/** Whether a freshly started brainrotnt can isolate: the profile only applies to processes started after it loads. */
async function isolatesInNewProcess(binary: string): Promise<boolean> {
  const proc = Bun.spawn([binary, "setup", "sandbox", "--check"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  return (await proc.exited) === 0;
}

/** `brnt setup sandbox`: make network isolation work on this machine, or say why it cannot. */
export async function setupSandbox({ check }: { check: boolean }): Promise<number> {
  const mode = await getSandboxMode();
  if (check) return mode === "strict" ? 0 : 1;
  const line = (text: string) => console.log(`  ${text}`);

  if (mode === "strict") {
    line(ok("sandbox: network isolation works"));
    return 0;
  }
  if (!Bun.which("python3")) {
    line(fail("sandbox: python3 was not found; install it, then run brnt setup sandbox again"));
    return 1;
  }
  if (process.platform !== "linux") {
    line(warn("sandbox: network isolation needs Linux; set BRAINROTNT_ALLOW_UNSANDBOXED=1 to run code answers without it"));
    return 1;
  }
  if (!appArmorRestrictsUserNamespaces()) {
    line(fail("sandbox: unshare -rn fails here and AppArmor is not the cause (are user namespaces disabled in the kernel?)"));
    return 1;
  }

  // A profile for Bun itself would let every Bun script past the restriction, so only the installed binary gets one.
  const binary = realpathSync(process.execPath);
  if (basename(binary) === "bun") {
    line(fail("sandbox: run this from the installed brnt, not from source (it would allow every Bun program)"));
    return 1;
  }

  if (!Bun.which("sudo") || !Bun.which("apparmor_parser")) {
    line(fail("sandbox: AppArmor blocks user namespaces, and sudo or apparmor_parser is missing to allow them; see the README's sandbox section"));
    return 1;
  }

  line(`${bold("Sandbox:")} AppArmor blocks the user namespace that cuts code answers off the network.`);
  line(dim(`Allowing it for ${binary} only, with an AppArmor profile in ${APPARMOR_PROFILE} (needs sudo).`));
  const dir = mkdtempSync(join(tmpdir(), "brainrotnt-"));
  const file = join(dir, "brainrotnt");
  try {
    writeFileSync(file, appArmorProfile(binary));
    const loaded = (await sudo(["install", "-m", "644", file, APPARMOR_PROFILE])) && (await sudo(["apparmor_parser", "-r", APPARMOR_PROFILE]));
    if (!loaded) {
      line(fail("sandbox: could not install the AppArmor profile; run brnt setup sandbox again, or see the README's sandbox section"));
      return 1;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  if (!(await isolatesInNewProcess(binary))) {
    line(fail(`sandbox: the profile is loaded but network isolation still fails; check ${APPARMOR_PROFILE} and dmesg for apparmor="DENIED"`));
    return 1;
  }
  line(ok(`sandbox: network isolation works (AppArmor profile ${APPARMOR_PROFILE})`));
  return 0;
}

/** For `brnt uninstall`: the profile is outside the install folder and needs sudo to remove. */
export const appArmorProfileInstalled = () => existsSync(APPARMOR_PROFILE);
