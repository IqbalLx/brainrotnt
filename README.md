# brainrotnt

Brainrot, not. A cure for the vibe-coded, doom-scrolled brain: solve short STEM problems while your coding agent works for you, and get pulled back the moment it needs you.

The app watches your agent through [Luvus](https://github.com/RizRiyz/luvus) and shows a banner for its state (idle, working, blocked, done) next to a practice problem. A blocked agent always interrupts.

> Status: early. You can see live agent state, answer multiple-choice and numeric problems in math, stats and physics, and get graded instantly with every attempt recorded. Symbolic and code problems, the calculator, the drawing board and the problem-generation pipeline are not built yet.

## Prerequisites

- [Bun](https://bun.sh) 1.x (`curl -fsSL https://bun.sh/install | bash`). It runs the server, the package install and the dev scripts, so Node is not required.

## Run it locally

From the repo root:

```sh
bun install          # install both apps
bun run db:migrate   # create apps/bridge/bridge.sqlite
bun run db:seed      # load the starter problems (safe to re-run)
bun run dev:bridge   # terminal 1: API on http://127.0.0.1:8787
bun run dev:web      # terminal 2: UI on http://localhost:5173
```

Open http://localhost:5173, pick a subject and answer a problem. Without Luvus connected, the bridge uses a mock agent that cycles working, blocked, working, done and idle every 5 seconds, so you can see the banner react.

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

## How answers are graded

Grading happens on the bridge, so the answer key never reaches the browser. Every valid submission is stored in the `attempts` table with the answer, correctness, time taken and the agent state when the problem was shown.

- **Multiple choice:** the chosen option must be the correct one.
- **Numeric:** the value must be within the problem's relative tolerance (absolute when the answer is 0). You can type `12.4`, `1.2e3` or a fraction like `5/36`. If the problem has a unit, you can omit it, but a wrong unit counts as incorrect.
- **Symbolic and code** problems are not gradable yet, so they are never served.
- Input that cannot be parsed (for example `banana`) is rejected without being recorded as an attempt.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | liveness check |
| `GET /api/problems/next?subject=math\|stats\|physics&minDifficulty=1&maxDifficulty=5&exclude=id1,id2` | one random verified problem, `404` when none match |
| `POST /api/attempts` | grade and record an answer: `{problemId, answer, secondsSpent, agentState}` |
| `GET /api/agent-state/stream` | server-sent events with the current agent state |

## Checks

```sh
bun run test                          # grading unit tests
cd apps/bridge && bunx tsc --noEmit   # typecheck the bridge
cd apps/web && bun run build          # typecheck and build the UI
```

## Build the bridge as one binary

```sh
cd apps/bridge && bun run build       # outputs apps/bridge/dist/bridge
```

The binary contains only the API. It does not serve the UI and does not run migrations, so you still need `bun run db:migrate` and the web dev server.
