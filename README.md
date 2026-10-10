# brainrotnt

Brainrot, not. A cure for the vibe-coded, doom-scrolled brain: solve short STEM problems while your coding agent works for you, and get pulled back the moment it needs you.

The app watches your agent through [Luvus](https://github.com/RizRiyz/luvus) and shows a banner for its state (idle, working, blocked, done) next to a practice problem. A blocked agent always interrupts.

> Status: early walking skeleton. You can see live agent state and one fallback problem. Answer submission, grading, the calculator, the drawing board and the problem pipeline are not built yet.

## Prerequisites

- [Bun](https://bun.sh) 1.x (`curl -fsSL https://bun.sh/install | bash`). It runs the server, the package install and the dev scripts, so Node is not required.

## Run it locally

From the repo root:

```sh
bun install          # install both apps
bun run db:migrate   # create apps/bridge/bridge.sqlite
bun run dev:bridge   # terminal 1: API on http://127.0.0.1:8787
bun run dev:web      # terminal 2: UI on http://localhost:5173
```

Open http://localhost:5173. Without Luvus connected, the bridge uses a mock agent that cycles working, blocked, working, done and idle every 5 seconds, so you can see the banner react.

Run `bun run db:migrate` again whenever the schema changes (`bun run db:generate` creates a new migration after you edit `apps/bridge/src/db/schema.ts`).

## Connect it to a real Luvus agent

The bridge reads agent state from a Luvus session over its Unix socket. Point it at the socket and restart the bridge:

```sh
UHP_SOCKET_PATH=/path/to/luvus.sock bun run dev:bridge
```

Inside a Luvus pane, `$LUVUS_SOCKET_PATH` is already set and is used automatically. From any other terminal, find the socket with `luvus session list --json`.

The bridge connects to the socket with your full local user authority and only reads state. Luvus named pipes (Windows) are not supported yet, and this path has been tested against a fake server written from the UHP 1.0 spec, not against a live Luvus.

## Configuration

| Variable | Default | Used by | Purpose |
|---|---|---|---|
| `PORT` | `8787` | bridge | API port (binds `127.0.0.1` only) |
| `DB_PATH` | `./bridge.sqlite` | bridge | SQLite file, relative to `apps/bridge` |
| `WEB_ORIGIN` | `http://localhost:5173` | bridge | Allowed CORS origin |
| `UHP_SOCKET_PATH` | unset | bridge | Luvus socket; unset means the mock agent |
| `BRIDGE_URL` | `http://127.0.0.1:8787` | web | Where the Vite dev server proxies `/api` |

## Project layout

```
apps/
  bridge/              Bun + Hono API, Drizzle + bun:sqlite
    src/features/      one folder per feature (vertical slices)
    src/infra/         shared infrastructure, e.g. the Luvus (UHP) client
    src/db/            schema, client, migration runner
    drizzle/           generated SQL migrations
  web/                 Vite + React + TypeScript + Tailwind + shadcn-style components
    src/features/      UI feature folders
    src/components/ui/ shadcn components
```

API endpoints: `GET /api/health`, `GET /api/problems/next?subject=math|stats|physics|code`, and `GET /api/agent-state/stream` (server-sent events).

## Checks

```sh
cd apps/bridge && bunx tsc --noEmit   # typecheck the bridge
cd apps/web && bun run build          # typecheck and build the UI
```

## Build the bridge as one binary

```sh
cd apps/bridge && bun run build       # outputs apps/bridge/dist/bridge
```

The binary contains only the API. It does not serve the UI and does not run migrations, so you still need `bun run db:migrate` and the web dev server.
