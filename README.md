# brainrotnt

Brainrot, not. A cure for the vibe-coded, doom-scrolled brain: solve short STEM problems while your coding agent works for you, and get pulled back the moment it needs you.

The app watches your agent through [Luvus](https://github.com/RizRiyz/luvus) and shows a banner for its state (idle, working, blocked, done) next to a practice problem. A blocked agent always interrupts.

> Status: early. You can see live agent state, answer multiple-choice and numeric problems in math, stats and physics, get graded instantly with every attempt recorded, and flag a bad problem. Symbolic and code problems and the drawing board are not built yet.

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
| `POST /api/flags` | flag a wrong or ambiguous problem: `{problemId, reason?}`; it stops being served |
| `GET /api/session-summary?since=<ISO time>` | attempts, correct, accuracy and a per-subject breakdown since that time |
| `GET /api/agent-state/stream` | server-sent events with the current agent state |

## Settings

The bar above the problem sets the subject, a difficulty range (click the dots: a dot outside the range extends it, an end dot shrinks it by one level) and a calculator tier (none, basic, scientific or stats). They are remembered in this browser's local storage. The calculator tier is a ceiling: each problem declares the tier it allows, and the tool chip on the card shows the lower of the two. Choosing None acts as strict mode.

## Adding problems with Claude Code

The bridge exposes an MCP endpoint, so Claude Code can grow the problem bank using the subscription you already have. Add it once:

```sh
claude mcp add --transport http brainrotnt http://127.0.0.1:8787/mcp
```

Then ask for what you want, for example "use brainrotnt to add 5 stats problems on confidence intervals, difficulty 2 to 4". Claude Code gets five tools:

| Tool | Purpose |
|---|---|
| `get_schema` | the problem schema, allowed values and limits (it starts here) |
| `get_coverage` | counts per subject, topic and difficulty, to find gaps |
| `submit_problems` | verify and insert up to 25 problems; each item comes back inserted or rejected with its errors |
| `list_flagged` | problems you flagged in the UI, with their key and your reasons |
| `update_problem` | replace a problem after repair |

The server only accepts what it can verify. Every problem carries a Python **reference solution** that computes the answer from scratch and prints one JSON value (a number, or the index of the correct option). The server runs it in the sandbox below and rejects the problem if it disagrees with the stated answer, so keys are computed rather than recalled. Duplicates (same statement and topic) are rejected, and statements must be original: store a source pointer such as a chapter, never copied text.

For quantitative topics, Claude Code can submit a **template** instead of many hand-written problems: one statement with `{placeholders}` and a seeded Python generator.

```python
import math, random
def generate(seed):
    rng = random.Random(seed)
    v = rng.randint(10, 30)
    angle = rng.choice([25, 30, 35, 40, 45, 50, 55])
    return {"params": {"v": v, "angle": angle}, "answer": round(v**2 * math.sin(math.radians(2 * angle)) / 9.8, 2)}
```

The server runs the generator in the sandbox for seeds 0 to 49 and accepts it only if every seed works: no exceptions, the same output when called twice with the same seed, params covering every placeholder, a finite answer (or distinct options with a valid correct index for multiple choice), and enough distinct statements for the number of variants asked for. It then expands a fixed number of variants (1 to 50) into the bank as ordinary verified problems with ids like `<id>.s0`, `<id>.s1`, so answers are computed rather than recalled and nothing runs at serve time. A template goes in whole or not at all, and submitting the same one twice is refused.

### Importing from files

The same validation, sandboxed verification and deduplication are available without MCP. Ask Claude Code to write a YAML file, or write one yourself, then:

```sh
bun run import problems/example.yaml
```

A file holds a problem, a list of problems, or an object with a `problems` list, and each item is either a problem with a reference solution or a template. `problems/example.yaml` shows all three kinds and is imported by a test, so it stays correct. The command prints one line per item (inserted with its id, or rejected with the reasons), keeps the good items when others fail, and exits 1 if anything was rejected. Importing a file twice refuses every item as a duplicate. It uses the bridge's database (`apps/bridge/bridge.sqlite`, or `DB_PATH`) from any directory.

Flag a bad problem with the Flag button and it leaves rotation. Ask Claude Code to fix the flagged ones: `update_problem` verifies the corrected version, inserts it as the next version (`<id>.v2`), retires the old one and resolves its flags. Your earlier attempts stay attached to the version you answered.

The whole API, including `/mcp`, only answers requests addressed to `localhost`, `127.0.0.1` or `[::1]` and refuses foreign `Origin` headers, so a web page open in your browser (or a DNS-rebinding trick) cannot write to your problem bank. There is no other authentication: it is a local tool.

## Sandbox for generated code

Problems added through the content pipeline carry Python code (reference solutions and generators) written by an AI agent, possibly from injected source material, so it is never trusted. `apps/bridge/src/infra/sandbox-runner.ts` runs it in a subprocess with a 5 second limit, 512 MB of memory, a 1 MB file-size limit, 64 open files, a scrubbed environment (nothing from yours leaks in), an empty temp directory, capped output, and **no network** (a Linux network namespace via `unshare -rn`).

Where that isolation is unavailable (macOS, Windows, or a Linux without user namespaces) the runner fails closed and the bridge says so at startup and in `GET /api/health`. Set `BRAINROTNT_ALLOW_UNSANDBOXED=1` to run with the limits but without network isolation, which means trusting whatever code you submit. It needs `python3` on your PATH.

## Calculator

Problems that allow a calculator show a panel under the card. The tier is enforced in code, not hidden in the UI, in two layers: the maths library instance has its escape hatches (`import`, `evaluate`, `parse`, `simplify`, `derivative`, ...) replaced with errors and its factorial and combinatorics capped, and every expression's syntax tree is checked against the tier's whitelist before anything is evaluated.

| Tier | Allowed |
|---|---|
| basic | `+ - * / ^`, unary minus, `sqrt`, percent, parentheses |
| scientific | basic plus `sin cos tan asin acos atan`, `log` (natural), `log10`, `exp`, `pi`, `e`, factorial (angles in radians) |
| stats | scientific plus `mean`, `std` (sample), `combinations`, `permutations` |

Assignments, matrices, ranges, units, strings, comparisons and modulo are never allowed. Keys above the tier are shown disabled rather than removed. After `+` or `-`, a percentage is of the left side, as on a handheld calculator (`200+10%` is `220`). When you use the calculator on a problem, the attempt is recorded with `toolsUsed: ["calculator"]`. The maths library loads only when a calculator is first shown.

## Runs and the session summary

A run is the stretch where the agent is Working or Blocked. The timer counts through it, pauses when the agent is Done or Idle, and starts again from zero on the next run. When a run ends in Done and you answered at least one problem during it, a session summary is offered: attempts, accuracy, elapsed time and a per-subject breakdown. Dismiss it with the button or Escape; it is not shown again for that run.

## Look and feel

The UI follows the brainrotnt design system. Its tokens live in `apps/web/src/index.css` as CSS variables (surfaces, ink, the four state colours, radii, shadows) with Tailwind utilities for each, plus the type styles (`text-body`, `text-label`, `text-heading-sm`, and so on). Dark is the default; the light theme applies when your OS prefers it, or with `data-theme="light"` on `<html>`. shadcn's variable names (`--background`, `--primary`, ...) are mapped onto the same tokens, so components added with `shadcn add` pick up the theme.

Agent state names are shown exactly as Luvus reports them (Idle, Working, Blocked, Done). Blocked is the only state that interrupts: it pins a banner to the top of the window.

## Checks

```sh
bun run test                          # bridge grading and API route tests (temp database), web timer tests
cd apps/bridge && bunx tsc --noEmit   # typecheck the bridge
cd apps/web && bun run build          # typecheck and build the UI
```

## Build the bridge as one binary

```sh
cd apps/bridge && bun run build       # outputs apps/bridge/dist/bridge
```

The binary contains only the API. It does not serve the UI and does not run migrations, so you still need `bun run db:migrate` and the web dev server.
