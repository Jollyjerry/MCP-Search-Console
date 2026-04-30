# Skills

Index of Claude Code skills shipped with this repo. The actual skill files live under [`.claude/skills/`](../.claude/skills/) — the only path Claude Code auto-discovers, so don't move them.

## Available skills

| Skill | Triggers on | Source |
|-------|-------------|--------|
| `gsc-query` | Any GSC data question — queries, clicks, impressions, CTR, ranking, position. Also covers multi-property workflows when the user has several Search Console sites. | [SKILL.md](../.claude/skills/gsc-query/SKILL.md) |
| `gsc-debug` | A GSC tool returns empty rows, zeros, errors, or numbers that contradict the GSC UI. 8-step checklist for property type, data lag, search type, regex, permissions, sampling, time zones. | [SKILL.md](../.claude/skills/gsc-debug/SKILL.md) |
| `gsc-seo-audit` | "Run a full SEO audit", "SEO health check", "give me a prioritized SEO action list". Orchestrates `traffic_overview` + `compare_periods` + `branded_vs_non_branded` + `ctr_opportunities` + `cannibalization_check` + `position_movement` + `list_sitemaps` and synthesizes findings. | [SKILL.md](../.claude/skills/gsc-seo-audit/SKILL.md) |
| `gsc-url-diag` | "Why is /x not ranking?", "varför tappade /x trafik?", "felsök denna sida". Single-URL diagnosis combining `inspect_url` + `queries_for_page` + `time_series` + `query_performance`. | [SKILL.md](../.claude/skills/gsc-url-diag/SKILL.md) |
| `gsc-ship` | "Ship", "release", "deploya gsc". One-shot release flow via `npm run ship` — bump DXT, push, PR + auto-merge, server upgrade, DXT pack. | [SKILL.md](../.claude/skills/gsc-ship/SKILL.md) |

## Why this folder is just an index

Claude Code only auto-discovers skills under `.claude/skills/`. This top-level `Skills/` folder exists because `.claude/` is hidden in most file explorers; the index here makes the skills visible without breaking auto-discovery.

## Adding a new skill

1. Create `.claude/skills/<name>/SKILL.md` with frontmatter:
   ```yaml
   ---
   name: <name>
   description: <one-line trigger description that the model uses to decide when to invoke>
   ---
   ```
2. Add a row to the table above so it's discoverable in the file tree.
3. Commit and ship via `npm run ship` (skills bundle into the next DXT release for visibility on other machines).
