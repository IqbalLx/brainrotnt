// The development server: API and MCP on 127.0.0.1:8787, with Vite serving the web app on 5173.
// The installed app starts from cli/main.ts instead and serves everything from one port.
import { cors } from "hono/cors";
import { createApp } from "./app";
import { localOnly } from "./infra/local-only";
import { getSandboxMode, sandboxWarning } from "./infra/sandbox-runner";
import { createUhpClient } from "./infra/uhp-client";

const sandbox = await getSandboxMode();
const warning = sandboxWarning(sandbox);
if (warning) console.warn(`[sandbox] ${warning}`);

// Without a socket path, development uses a mock agent that cycles through the states.
const uhpClient = createUhpClient({ mockWhenUnset: true });
await uhpClient.start();

const app = createApp({
  uhpClient,
  sandbox,
  version: "dev",
  access: localOnly,
  api: [cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" })],
});

const port = Number(process.env.PORT ?? 8787);
console.log(`bridge listening on http://127.0.0.1:${port}`);

export default {
  port,
  hostname: "127.0.0.1",
  fetch: app.fetch,
};
