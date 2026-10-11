#!/usr/bin/env sh
# Copies skills/ into the harness skill folders listed in skills.sync.json.
#   scripts/sync-skills.sh           sync
#   scripts/sync-skills.sh --repo-only   sync only the copies committed in the repo
#   scripts/sync-skills.sh --check       fail if a committed copy has drifted (for CI)
exec bun "$(dirname "$0")/sync-skills.ts" "$@"
