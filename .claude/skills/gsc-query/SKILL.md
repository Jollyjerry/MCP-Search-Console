---
name: gsc-query
description: Use whenever the user asks for Google Search Console data — search queries, clicks, impressions, CTR, average position, page-by-page organic performance, query performance breakdowns. Triggers on terms like "search console", "queries", "klicks", "impressions", "CTR", "ranking", "position", "organisk SEO för en sida".
---

# GSC Query Skill

You have access to a Search Console MCP server (`mcp-search-console`). Use it whenever the user asks about organic search data instead of guessing or asking them to open Search Console manually.

## Tool selection — pick the most specific tool

1. **`list_sites`** — first call when you don't know which property to query. Lists all GSC properties the service account has access to.
2. **`top_queries`** — top search queries for a site/date range. Sort by `clicks` (default), `impressions`, `ctr`, or `position`. Filter by country (ISO-3) or device.
3. **`top_pages`** — top landing pages from organic search. Same sort/filter options. Add `pageContains` to narrow to a path prefix.
4. **`query_performance`** — drill into a specific query (or pattern). Returns totals + a per-page (default), per-date, per-country, or per-device breakdown.

## Date defaults

If the user doesn't specify a range:
- Default preset is `last_28_days` (matches GSC UI default)
- For trend questions, use a longer preset (`last_90_days`, `last_365_days`)
- GSC retention is 16 months max (`last_16_months` is the ceiling)
- GSC has 2-3 day data lag — `dataState: "final"` (default) excludes the most recent days for accuracy. Use `dataState: "all"` only when the user explicitly wants the freshest (less stable) data.

## SiteUrl handling

`siteUrl` is required by every search analytics call. Three options, in order:

1. The user passes it explicitly (e.g. `"sc-domain:jollyroom.se"` or `"https://www.jollyroom.se/"`).
2. The backend's `GSC_DEFAULT_SITE` env var is used as fallback.
3. If neither is available, call `list_sites` first and pick the most likely match (or ask).

Domain-property format: `sc-domain:example.com` (no scheme, no slash).
URL-prefix format: `https://www.example.com/` (with trailing slash).

## Output expectations

After every successful GSC call:
1. Lead with the answer in plain Swedish, not raw JSON.
2. State the **siteUrl used** and the **date range** so the user can sanity check.
3. CTR formatted as percentage with 2 decimals (`12.34%`).
4. Position with 1 decimal (`5.2` for "average position 5.2").
5. Surface the top 5-10 rows in the response, full row list in `structuredContent.rows`.

## Combining with GA4

GA4 and GSC pair beautifully:
- GSC `top_pages` gives organic queries → impressions → clicks per page
- GA4 `top_pages` then says how those landed sessions converted (transactions, revenue)

When the user asks an "organic SEO performance" question, suggest both — e.g. "vill du också se hur många av de här klicken konverterade till köp i GA4?".

## Don't

- Don't guess `siteUrl` — call `list_sites` if unsure.
- Don't include today's date in custom ranges. GSC has 2-3 day lag and `dataState: "final"` already excludes incomplete days.
- Don't claim a query is "ranking #1" without checking what query type (`searchType: "web"` vs `image`/`video`/`discover`) the user means.
- Don't run `top_queries` for a 16-month range without a strong reason — that's a 1000-row hit and slow.
