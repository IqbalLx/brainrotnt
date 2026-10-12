# brainrotnt

Practise STEM problems while a coding agent works; agent state comes from Luvus (UHP). Bun monorepo, no Node needed.

## Layout

- `apps/bridge`: Bun + Hono API, Drizzle + bun:sqlite, MCP server, and the `brnt` CLI (`src/cli`). One binary serves the web build, API, SSE agent feed and MCP.
  - `src/features/<verb-noun>/`: one slice per use case (`route.ts`, `command.ts`/`query.ts`, `schema.ts`, tests), registered in `src/app.ts`.
  - `src/infra/`: shared adapters. `uhp-client.ts` is the only Luvus code (local socket + Luvus machines over SSH).
  - `src/content`, `src/grading`, `src/sessions`, `src/mcp`, `src/db` (schema, migrations in `drizzle/`).
- `apps/web`: Vite + React + Tailwind. `src/features/<feature>/`: components, hooks and pure logic with `*.test.ts` beside them.
- `packages/math-engine`: shared math grading. `skills/`: source of the problem-authoring skill, synced to `.claude/skills` (`bun run skills:sync`).
- `scripts/`: release build, skill sync/schema, `uhp-tap`/`sse-tap` debug taps.

## Architecture

Vertical slices: a feature owns its route, logic, validation and tests. Add a folder, don't grow a layer. Shared code goes in `infra/` or a domain folder only once two slices need it. Keep logic pure and tested (e.g. `web/.../reminders.ts`), with hooks/routes as thin wiring.

## Commands

- `bun run dev:bridge`, `bun run dev:web` (mock agent unless `UHP_SOCKET_PATH` is set); `bun run brnt -- <args>` runs the CLI from source.
- `bun run test`. On macOS, bridge tests need `BRAINROTNT_ALLOW_UNSANDBOXED=1` (the sandbox needs Linux `unshare`). `sandbox runner > memory is limited` still fails on macOS; that's expected.
- Typecheck: `(cd apps/bridge && bunx tsc --noEmit -p .)`, `(cd apps/web && bunx tsc -b)`. CI also runs `skills:check` and `skills:schema:check`.

## Workflow and release

- Branch `claude/<topic>` → PR to `main` → CI green → merge with a merge commit (GitHub deletes the branch).
- Release: tag the merge commit `vX.Y.Z` and push the tag. `release.yml` builds 4 platforms, publishes with generated notes, and `install.sh`/`brnt update` pick it up. Patch bump per feature. No version field to edit.
