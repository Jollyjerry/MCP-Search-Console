---
name: gsc-debug
description: Use when a Search Console MCP tool returns empty rows, zeros, errors, or numbers that contradict what the user sees in the GSC UI. Walks through GSC-specific failure modes before assuming the MCP server has a bug.
---

# GSC Debug Skill

GSC reports fail or surprise users for a small number of well-known reasons. Walk through this checklist **before** assuming the MCP server has a bug.

## Step 1 — Confirm the site

Run `list_sites` once. Check:
- The `siteUrl` the user expects is in the list. If not, the service account has not been added in Search Console → Settings → Users and permissions for that property.
- **Property type matters.** Domain properties look like `sc-domain:jollyroom.dk` (no scheme, no slash). URL-prefix properties look like `https://www.jollyroom.dk/` (with scheme AND trailing slash). They are **different properties** with different data — adding "jollyroom.dk" to one does not propagate.
- Permission level: `siteRestrictedUser` is fine for read-only queries; `siteUnverifiedUser` means the user needs to verify ownership before access works.

## Step 2 — Date range sanity

GSC differs from GA4:
- **Data lag is 2-3 days minimum.** A query for "yesterday" returns mostly zero. Default `dataState: "final"` already excludes incomplete days, so you may see fewer rows than expected for short ranges.
- **`dataState: "all"`** includes the freshest (less stable) data — only use when the user explicitly accepts the lower confidence.
- **16-month retention cap.** Date ranges older than ~480 days return empty. The `last_16_months` preset is the ceiling.
- **Time zone is Pacific (US),** not the user's local zone. "Yesterday" boundaries don't match the user's clock.

## Step 3 — Search type mismatch

`searchType` defaults to `"web"`. If the user is comparing to GSC UI numbers and they don't match:
- The UI default is "Web" but users often switch to "Image", "Video", "Discover", "Google News", etc. without realizing.
- Discover traffic in particular can be huge for some sites and is **excluded** from `searchType: "web"`.
- If totals are way lower than expected, ask which tab the user is looking at in the UI and pass the matching `searchType`.

## Step 4 — Site URL format

The most common 0-results bug: passing a Domain property URL where a URL-prefix property exists, or vice versa.
- `sc-domain:jollyroom.dk` ≠ `https://www.jollyroom.dk/`
- `https://www.jollyroom.dk/` ≠ `https://jollyroom.dk/` (without `www`)
- `https://www.jollyroom.dk` (no trailing slash) is invalid — Search Console rejects.

When in doubt, run `list_sites` and copy the exact string.

## Step 5 — Filter / regex problems

`top_queries`, `top_pages`, `queries_for_page`, `time_series`, `branded_vs_non_branded` all accept filters. Common pitfalls:
- `equals` is case-sensitive on `query` (mostly), but **case-insensitive on `country` and `device`**.
- `country` filter expects ISO-3 codes (`SWE`, `DNK`, `NOR`, `FIN`) — **lowercase** (`swe`, `dnk`). The `countryFilter` field handles the casing for you.
- `device` filter accepts only `DESKTOP`, `MOBILE`, `TABLET` — uppercase, exact.
- `includingRegex` / `excludingRegex` use **RE2 syntax**, not Perl. No lookahead, no backreferences. Most ASCII patterns work; word boundaries use `\b`.
- A regex with no matches returns 0 rows silently — verify the pattern in the GSC UI's regex filter first if unsure.

## Step 6 — Sampling / row caps

- The Data API row cap is 25,000 per query. Higher values are silently truncated.
- High-cardinality dimensions (especially `query`+`page` combos in `cannibalization_check`) hit the cap fastest. If `candidatesScanned == candidatePoolSize`, increase the cap.
- Search Console samples internally for large sites — totals from `traffic_overview` may not equal the sum of `top_queries` rows because of sampling at the per-query level.

## Step 7 — Permissions / API enablement

If every tool fails with an auth error:
- Service account must be added as a user on the GSC property (Settings → Users and permissions → Add user). Use the exact `client_email` from the JSON.
- The **Search Console API** must be enabled in the GCP project (visit `https://console.developers.google.com/apis/api/searchconsole.googleapis.com/overview?project=<PROJECT_NUMBER>`).
- The **URL Inspection API** is part of the same Search Console API — but rate-limited to 2,000 inspections/day per property. `inspect_url` failures during heavy use are usually quota.

## Step 8 — Numbers don't match GSC UI

If totals differ from the Performance report:
- UI default range is "Last 3 months excluding today's date" ≈ `last_90_days` (close but not exact).
- UI excludes "anonymized queries" (less than ~10 impressions); the API does the same — they don't appear in `top_queries`.
- Different `searchType` (see step 3) is the most common cause.
- UI sums show totals across countries; API per-country breakdown applies sampling at country level → small per-country sum may be a few % off the headline.
- "Average position" is impression-weighted, so adding rows together doesn't recompute position correctly — use `traffic_overview` for the headline number.

## What to report back to the user

Lead with the **diagnosis** (which step from above), not with code. If the cause is a property-side or auth issue, state that plainly so the user can act. Only suggest code/MCP changes when steps 1-8 are ruled out.
