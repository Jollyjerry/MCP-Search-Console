---
name: gsc-seo-audit
description: Use when the user asks for a full SEO audit, SEO health check, SEO översikt, prioriterad SEO-att-göra-lista, or generally "go through everything that could be improved on this site". Orchestrates multiple GSC tools and synthesizes the findings into a ranked action list.
---

# GSC SEO Audit Skill

Walk through this 6-step audit when the user asks for a holistic SEO health check on a Search Console property. Each step is one tool call; report findings as you go and synthesize at the end.

## Inputs to confirm before starting

- **`siteUrl`** — required. If unset, run `list_sites` and either pick the obvious one or ask.
- **Period** — default `last_90_days`. The audit is more meaningful over a quarter than a week.
- **Brand regex** — default `jollyroom`. Override if the user signals a different brand.

## Step 1 — Headline KPIs

Run `traffic_overview` for the chosen period, then `compare_periods` with `comparison: "mom"` (or `"yoy"` if the user mentions seasonality).

What to surface:
- Total clicks / impressions / CTR / avg position
- MoM (or YoY) change for each metric
- Flag any metric that dropped >10% — that's the audit's first priority

## Step 2 — Branded vs non-branded health

Run `branded_vs_non_branded`. Healthy SEO sites have a meaningful non-brand share (typically 30-70% depending on category). Pure-brand traffic suggests the site only appears for people who already know it — limited acquisition.

What to surface:
- Branded share %
- Non-branded share %
- If branded share is >80%, flag as "low organic acquisition reach"
- If non-branded clicks dropped MoM more than branded did, flag as "non-brand SEO regressing"

## Step 3 — CTR opportunities

Run `ctr_opportunities` with default thresholds. This is the single most actionable list — queries where you're already visible but losing clicks because the title/description isn't compelling.

What to surface:
- Top 5-10 queries by `potentialAdditionalClicks`
- Mention which page each query maps to (use `query_performance` for top 1-2 if user wants depth)
- Recommendation: rewrite title + meta description for those pages

## Step 4 — Cannibalization

Run `cannibalization_check` with defaults. Multiple pages competing on the same query is a symptom of unclear information architecture or duplicate content.

What to surface:
- Top 3-5 cannibalization groups by total impressions
- For each: which pages are competing, what positions, which one should win
- Recommendation: consolidate to one canonical page (301 the rest, or de-optimize)

## Step 5 — Position movement (winners + losers)

Run `position_movement` with `comparison: "mom"` (or `"wow"` if they're shipping fast).

What to surface:
- Top 5 losers (queries that dropped position the most)
- Top 5 winners (queries that gained position)
- Pay extra attention to losers — those signal recent regressions worth investigating with `inspect_url` on the affected page

## Step 6 — Indexing health

Run `list_sitemaps`. Check:
- All expected sitemaps submitted?
- Any sitemap with errors > 0?
- Last fetch timestamp recent (within a week for active sites)?

For any losers from step 5 that look serious, run `inspect_url` on the affected URL — verdict, coverage state, last crawl, canonical match.

## Synthesis: the ranked action list

At the end, output a **prioritized list** combining findings:

1. Indexing emergencies (verdict ≠ PASS, sitemap errors)
2. Big losers from position_movement (recent regressions)
3. Top 3 CTR opportunities (highest potentialAdditionalClicks)
4. Top 1-2 cannibalization fixes
5. Branded share concern (if non-brand is regressing)
6. Smaller MoM drops in headline metrics

Each item should have:
- **Issue** (one sentence)
- **Affected URL/query**
- **Recommended action** (concrete: "rewrite title", "consolidate to /x", "submit fixed sitemap")
- **Estimated impact** (use the numbers — `potentialAdditionalClicks`, current clicks, etc.)

## Don't

- Don't run all 6 steps in parallel — output each step's finding before moving on, so the user can interrupt and redirect.
- Don't add steps that aren't backed by a real GSC tool call. If you can't measure it, leave it out.
- Don't include generic SEO advice ("make sure your site is fast", "use HTTPS"). The audit's value is being **specific to this site's data**.
- Don't guess at fix difficulty without seeing the page. If asked "should we do this fix?", offer to run `inspect_url` to look at the affected URL first.
