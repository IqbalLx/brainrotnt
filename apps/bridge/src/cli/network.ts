import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

// Virtual interfaces that other devices on the Wi-Fi cannot reach.
const VIRTUAL = /^(docker|br-|veth|virbr|vmnet|vboxnet|utun|awdl|llw|bridge|tailscale|zt)/;

/**
 * The IPv4 addresses other devices on the local network can use to reach this machine: external,
 * not link-local (169.254.x, which means no DHCP lease), not a container or VPN bridge. Physical
 * interfaces (en*, eth*, wl*) come first, as they are the likely Wi-Fi or Ethernet.
 */
export function lanAddresses(interfaces: Record<string, NetworkInterfaceInfo[] | undefined> = networkInterfaces()): string[] {
  const found: { name: string; address: string }[] = [];
  for (const [name, infos] of Object.entries(interfaces)) {
    if (VIRTUAL.test(name)) continue;
    for (const info of infos ?? []) {
      if (info.family !== "IPv4" || info.internal || info.address.startsWith("169.254.")) continue;
      found.push({ name, address: info.address });
    }
  }
  const physical = (name: string) => (/^(en|eth|wl)/.test(name) ? 0 : 1);
  return [...new Set(found.sort((a, b) => physical(a.name) - physical(b.name) || a.name.localeCompare(b.name)).map((f) => f.address))];
}
