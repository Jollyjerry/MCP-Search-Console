# MCP-Search-Console

Model Context Protocol server for **Google Search Console**. Pairs with the GA4 MCP — GA4 says "this page got X organic sessions", Search Console says "this page was shown for Y queries, got Z clicks at position N".

> **Status:** scaffold. No GSC tools wired up yet.

## What this will expose

Planned tools (subject to iteration):

| Tool | Purpose |
|------|---------|
| `list_sites` | All Search Console properties the auth principal has access to. |
| `top_queries` | Top search queries for a site/date range, sorted by clicks/impressions/CTR. |
| `top_pages` | Top landing pages from organic search. |
| `query_performance` | Per-query breakdown (clicks, impressions, CTR, position). |
| `page_performance` | Per-page breakdown over a date range. |
| `compare_periods` | WoW / MoM / YoY for a metric on a site. |
| `index_status` | Indexing coverage / inspection for a URL. |
| `sitemaps` | List submitted sitemaps and last fetch status. |
| `run_query` | Generic Search Analytics query (escape hatch). |

## Auth

Same approach as the GA4 MCP: a Google service account with Search Console access added as a user on each property in GSC (`Settings → Users and permissions → Add user`, with the service-account email).

`GOOGLE_APPLICATION_CREDENTIALS` env var → JSON keyfile path.
Or `GOOGLE_SERVICE_ACCOUNT_JSON` → full JSON document for hosted deploys.

## Setup

```bash
npm install
npm run build
npm start            # stdio mode
npm run start:http   # http mode for remote connectors (TBD)
```

## Project layout

Mirrors the GA4 MCP repo so the same tooling (Docker, DXT, ship script) can be added later:

- `src/index.ts` — entry point
- `src/server/mcpServer.ts` — MCP server + tool registrations
- `src/gsc/` — Search Console client and reports (TBD)
- `src/config/` — env handling (TBD)
