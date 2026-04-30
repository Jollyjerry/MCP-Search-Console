---
name: gsc-ship
description: Use when the user wants a one-shot release of mcp-search-console — bumping the DXT version, merging to main, deploying the Docker server via SSH, and packing the .dxt artifact. Triggers on "ship", "release", "deploya gsc", "deploya search console", "starta om gsc-servern", "ship gsc 0.1.x".
---

# GSC Ship Skill

Mirrors the GA4 ship skill exactly. The work happens in [`scripts/ship.mjs`](../../scripts/ship.mjs) via `npm run ship`. The skill wraps that script with the right context and reacts to its output.

## What `npm run ship` does

1. Pre-flight (clean tree, branch ≠ main, ahead of main)
2. Type-check (`npx tsc --noEmit`)
3. DXT version bump on `dxt/manifest.json`
4. Push branch to origin
5. `gh pr create --fill` then `gh pr merge --squash --delete-branch`
6. Sync local main
7. SSH server: pull main, `docker compose up -d --build`, verify `/health` returns `ok:true`
8. Build + pack DXT → `artifacts/gsc-jollyroom-internal-<version>.dxt`

## When the skill is triggered

1. Check current branch — refuse to run from `main` (the script will block, but flag it early).
2. State the plan: "Bump DXT (patch), merge `<branch>` → main, deploy via `ssh ga4` to `~/apps/MCP-Search-Console` (port 3001), pack DXT. OK?". Wait unless the user pre-authorized.
3. Run `npm run ship` from the repo root via Bash.
4. Forward `→ Phase X — ...` and `[ship] ...` lines.
5. Report container status, `/health`, artifact path on success.
6. On failure, surface the exact `[ship]` error and stop. Don't auto-retry.

## Flag selection

| User says... | Pass |
|--------------|------|
| "minor bump" | `npm run ship -- --bump=minor` |
| "major bump" | `npm run ship -- --bump=major` |
| "skip versionsbumpen" | `npm run ship -- --no-bump` |
| "skip typecheck" | `npm run ship -- --no-typecheck` |
| "merga inte själv" | `npm run ship -- --no-merge` |
| "PR är redan mergad", "fortsätt deployen" | `npm run ship -- --resume` |

## Environment overrides (`.env.ship`, gitignored)

- `GSC_SSH_CMD` — full ssh invocation, default `ssh ga4`
- `GSC_SERVER_PATH` — repo path on server, default `~/apps/MCP-Search-Console`
- `GSC_HEALTH_URL` — health URL, default `http://127.0.0.1:3001/health`

On Windows + Git Bash, the default `ssh ga4` alias usually fails because `$HOME` points at a network drive. Set the explicit form in `.env.ship`:

```
GSC_SSH_CMD=ssh -i /c/Users/<username>/.ssh/id_ed25519_ga4_server -o IdentitiesOnly=yes <user>@<host>
```

## Don't

- Don't push directly to `main` outside this script.
- Don't bump `package.json` version when the user asks for a "DXT version bump".
- Don't claim the deploy worked until both `/health` is `ok:true` AND server HEAD matches origin/main.
- Don't commit `artifacts/` — it's gitignored.
