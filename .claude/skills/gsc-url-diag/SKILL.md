---
name: gsc-url-diag
description: Use when the user asks to investigate, diagnose, or troubleshoot a specific URL — "why is /x not ranking", "varför tappade /x trafik", "felsök denna sida", "denna sida indexerades inte". Combines indexing inspection with traffic and query-level performance for a single URL.
---

# GSC URL Diagnosis Skill

Run this 4-step diagnosis when the user has a specific URL that is underperforming, missing from search, or behaving unexpectedly. Each step is one tool call; report as you go.

## Inputs

- **URL** (required) — the full URL to diagnose. Resolve relative paths against the site's URL-prefix property.
- **`siteUrl`** — pick the property that contains the URL. Use `list_sites` if unclear.
- **Period** — default `last_90_days` (long enough to see trend, short enough that the data is fresh).

## Step 1 — Indexing state

Run `inspect_url` first. This is the most decisive single signal.

What to look at:
- **Verdict** = `PASS` / `NEUTRAL` / `FAIL` / `PARTIAL`. Anything other than `PASS` is the headline finding.
- **Coverage state** — if "Not indexed" or "Crawled - currently not indexed", the URL won't appear in search regardless of relevance. Stop here and explain.
- **Robots.txt state** — `DISALLOWED` means a robots rule is blocking, fix that first.
- **Canonical mismatch** — if `googleCanonical ≠ userCanonical`, Google has chosen a different page as canonical. The user's URL is then merged into another and won't rank as itself.
- **Sitemap inclusion** — if not in any sitemap, that's a contributing signal (not blocking, but suboptimal).
- **Last crawl** — if more than 30 days ago for an established site, Google has deprioritized crawling.

## Step 2 — Traffic to this URL

Run `queries_for_page` with the URL and `matchType: "equals"`. Period: same as audit.

What to look at:
- **Total clicks/impressions** for the URL across all queries
- **Top 5 queries** driving traffic to this URL — does the query intent match the page content?
- If 0 rows: the URL gets no organic traffic — the issue is upstream (indexing, ranking, or content relevance), not on-page CTR.
- If rows exist but clicks are concentrated on 1 query: ranking is narrow, page may not be optimized for related terms.

## Step 3 — Trend for this URL

Run `time_series` with `pageFilter: <URL>`, `pageMatchType: "equals"`, `granularity: "week"`, `metric: "clicks"`.

What to look at:
- **Sparkline shape** — steady, growing, declining, sudden cliff?
- A sudden cliff usually maps to: an algorithm update (look at the date), a deindexing event, or a site change (refactor, redirect).
- A slow decline often means a competitor is outranking; check `position_movement` next.

## Step 4 — Position movement on this URL's queries

For each of the top 2-3 queries from step 2, run `query_performance` with the query, `breakdownBy: "date"`, granularity in head — or use `time_series` with both `pageFilter` and `queryFilter` set.

What to look at:
- Has the URL's position for its main queries dropped recently?
- A drop from position ~3 → ~8 explains a CTR cliff (page-2 visibility kills clicks).
- A held position with declining clicks suggests SERP feature competition (richer competitors winning the click).

## Synthesis

Output a **single one-line headline diagnosis** followed by:
- The decisive finding (which of step 1-4 surfaced the smoking gun)
- The affected metric (clicks, position, indexing state)
- The recommended action (concrete: "fix canonical to point to /x", "submit URL for re-indexing in GSC", "rewrite title to target query Y", etc.)
- A rough estimate of recoverable traffic if known (use historical clicks or position-based benchmarks)

## Don't

- Don't run all four steps if step 1 returns FAIL with a clear cause — explain that and stop. Save the user's quota.
- Don't recommend "request indexing" via the GSC UI unless step 1 actually shows the URL is not indexed. Spamming Google's reindex queue makes things worse over time.
- Don't speculate about algorithm updates without checking the date the cliff started. If unsure, say so.
- Don't combine this skill with audit-wide tools — `gsc-seo-audit` is for whole-site, this skill is for one URL.
