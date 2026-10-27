import { describe, expect, test } from "bun:test";
import { parseArgs } from "./args";
import { lanAddresses } from "./network";
import { appArmorProfile } from "./sandbox-setup";
import { PATH_BEGIN, PATH_END, removePathBlock } from "./shell-path";

describe("parseArgs", () => {
  test("no arguments starts on the default port, localhost only", () => {
    expect(parseArgs([])).toEqual({ name: "start", port: null, network: false, open: false, allowRemoteCode: false, hosts: [] });
    expect(parseArgs(["start"])).toMatchObject({ name: "start" });
  });

  test("start options", () => {
    expect(parseArgs(["--port", "9000", "-n", "-o"])).toEqual({ name: "start", port: 9000, network: true, open: true, allowRemoteCode: false, hosts: [] });
    expect(parseArgs(["--port=9001"])).toMatchObject({ port: 9001 });
    expect(parseArgs(["-n", "--allow-remote-code"])).toMatchObject({ network: true, allowRemoteCode: true });
  });

  test("--host adds names to answer to in network mode, as the access check compares them", () => {
    expect(parseArgs(["-n", "--host", "100.101.102.103", "--host=Box.tail1234.TS.net"])).toMatchObject({ hosts: ["100.101.102.103", "box.tail1234.ts.net"] });
    expect(parseArgs(["-n", "--host", "fd7a:115c:a1e0::1"])).toMatchObject({ hosts: ["[fd7a:115c:a1e0::1]"] });
    expect(parseArgs(["-n", "--host", "a.example", "--host", "A.example"])).toMatchObject({ hosts: ["a.example"] });
    for (const bad of ["http://box", "box:8787", "100.101.102.103:8787", "box/x", "user@box", ""]) {
      expect(parseArgs(["-n", "--host", bad])).toMatchObject({ name: "error" });
    }
    expect(parseArgs(["-n", "--host"])).toMatchObject({ name: "error" });
    expect(parseArgs(["--host", "box"])).toMatchObject({ name: "error" });
  });

  test("bad input is an error, not a guess", () => {
    expect(parseArgs(["--port", "http"])).toMatchObject({ name: "error" });
    expect(parseArgs(["--port"])).toMatchObject({ name: "error" });
    expect(parseArgs(["--port", "70000"])).toMatchObject({ name: "error" });
    expect(parseArgs(["--allow-remote-code"])).toMatchObject({ name: "error" });
    expect(parseArgs(["--netwrok"])).toMatchObject({ name: "error" });
    expect(parseArgs(["setup"])).toMatchObject({ name: "error" });
    expect(parseArgs(["setup", "sandbox", "--force"])).toMatchObject({ name: "error" });
  });

  test("subcommands", () => {
    expect(parseArgs(["doctor"])).toEqual({ name: "doctor" });
    expect(parseArgs(["mcp"])).toEqual({ name: "mcp" });
    expect(parseArgs(["mcp", "--port", "1"])).toMatchObject({ name: "error" });
    expect(parseArgs(["setup", "claude"])).toEqual({ name: "setup-claude" });
    expect(parseArgs(["setup", "sandbox"])).toEqual({ name: "setup-sandbox", check: false });
    expect(parseArgs(["setup", "sandbox", "--check"])).toEqual({ name: "setup-sandbox", check: true });
    expect(parseArgs(["update"])).toEqual({ name: "update", force: false });
    expect(parseArgs(["update", "--force"])).toEqual({ name: "update", force: true });
    expect(parseArgs(["uninstall", "--purge", "-y"])).toEqual({ name: "uninstall", purge: true, yes: true });
    expect(parseArgs(["--version"])).toEqual({ name: "version" });
    expect(parseArgs(["-h"])).toEqual({ name: "help" });
  });
});

describe("lanAddresses", () => {
  const v4 = (address: string, internal = false) => ({ address, family: "IPv4" as const, internal, netmask: "", mac: "", cidr: null });
  const v6 = (address: string) => ({ address, family: "IPv6" as const, internal: false, netmask: "", mac: "", cidr: null, scopeid: 0 });

  test("keeps reachable IPv4 addresses, physical interfaces first", () => {
    expect(
      lanAddresses({
        lo0: [v4("127.0.0.1", true)],
        utun3: [v4("100.64.0.2")],
        bridge100: [v4("192.168.64.1")],
        docker0: [v4("172.17.0.1")],
        zz9: [v4("10.8.0.5")],
        en0: [v6("fe80::1"), v4("192.168.1.23")],
        en7: [v4("169.254.10.2")],
      }),
    ).toEqual(["192.168.1.23", "10.8.0.5"]);
  });

  test("no network gives no addresses", () => {
    expect(lanAddresses({ lo0: [v4("127.0.0.1", true)] })).toEqual([]);
  });
});

describe("removePathBlock", () => {
  test("removes only the brainrotnt block and the blank line before it", () => {
    const rc = ["export EDITOR=vim", "", PATH_BEGIN, 'export PATH="$HOME/.brainrotnt/bin:$PATH"', PATH_END, "alias ll='ls -l'", ""].join("\n");
    expect(removePathBlock(rc)).toBe(["export EDITOR=vim", "alias ll='ls -l'", ""].join("\n"));
  });

  test("leaves a file without the block unchanged", () => {
    const rc = "export EDITOR=vim\n";
    expect(removePathBlock(rc)).toBe(rc);
  });
});

describe("appArmorProfile", () => {
  test("allows user namespaces for exactly the given binary, quoted", () => {
    const profile = appArmorProfile("/home/a b/.brainrotnt/bin/brainrotnt");
    expect(profile).toContain('profile brainrotnt "/home/a b/.brainrotnt/bin/brainrotnt" flags=(unconfined) {');
    expect(profile).toContain("  userns,");
  });
});
