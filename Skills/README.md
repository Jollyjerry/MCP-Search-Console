# Skills

Index of Claude Code skills shipped with this repo. The actual skill files live under [`.claude/skills/`](../.claude/skills/) — the only path Claude Code auto-discovers, so don't move them.

## Available skills

| Skill | Triggers on | Source |
|-------|-------------|--------|
| `gsc-query` | "queries", "klicks", "impressions", "CTR", "ranking", "Search Console" — any organic search question. | [SKILL.md](../.claude/skills/gsc-query/SKILL.md) |
| `gsc-ship` | "ship", "release", "deploya gsc" — one-shot release flow via `npm run ship`. | [SKILL.md](../.claude/skills/gsc-ship/SKILL.md) |

## Why this folder is just an index

Claude Code only auto-discovers skills under `.claude/skills/`. This top-level `Skills/` folder exists because `.claude/` is hidden in most file explorers; the index here makes the skills visible without breaking auto-discovery.
