import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";

import { env } from "../config/env.js";
import { createGscClient } from "../gsc/client.js";
import { getBrandedVsNonBranded } from "../gsc/reports/brandedVsNonBranded.js";
import { getCannibalizationCheck } from "../gsc/reports/cannibalizationCheck.js";
import { comparePeriods } from "../gsc/reports/comparePeriods.js";
import { getCountryBreakdown } from "../gsc/reports/countryBreakdown.js";
import { getCtrOpportunities } from "../gsc/reports/ctrOpportunities.js";
import { getDeviceBreakdown } from "../gsc/reports/deviceBreakdown.js";
import { inspectUrl } from "../gsc/reports/inspectUrl.js";
import { listSites } from "../gsc/reports/listSites.js";
import { listSitemaps } from "../gsc/reports/listSitemaps.js";
import { getPositionMovement } from "../gsc/reports/positionMovement.js";
import { getQueriesForPage } from "../gsc/reports/queriesForPage.js";
import { getQueryPerformance } from "../gsc/reports/queryPerformance.js";
import { getSearchAppearanceBreakdown } from "../gsc/reports/searchAppearanceBreakdown.js";
import { getTimeSeries } from "../gsc/reports/timeSeries.js";
import { getTopPages } from "../gsc/reports/topPages.js";
import { getTopQueries } from "../gsc/reports/topQueries.js";
import { getTrafficOverview } from "../gsc/reports/trafficOverview.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger(env.LOG_LEVEL);

const presetEnum = z.enum([
  "last_7_days",
  "last_28_days",
  "last_30_days",
  "last_90_days",
  "last_365_days",
  "last_16_months"
]);

function toolError(prefix: string, error: unknown) {
  const message = error instanceof Error ? error.message : `Unknown ${prefix} error.`;
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `${prefix} failed: ${message}` }]
  };
}

export function createMcpServer() {
  const server = new McpServer({
    name: "mcp-search-console",
    version: "0.1.0"
  });

  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Health check for the Search Console MCP server."
    },
    async () => {
      logger.info("Handled ping tool");
      return {
        content: [{ type: "text", text: "pong" }],
        structuredContent: { ok: true, service: "mcp-search-console" }
      };
    }
  );

  server.registerTool(
    "get_current_config",
    {
      title: "Current Config",
      description: "Return sanitized runtime configuration for local debugging.",
      inputSchema: {
        includePaths: z.boolean().default(false)
      }
    },
    async ({ includePaths }) => {
      const structuredContent = {
        nodeEnv: env.NODE_ENV,
        defaultSite: env.GSC_DEFAULT_SITE ?? null,
        hasGoogleCredentials: Boolean(env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_SERVICE_ACCOUNT_JSON),
        logLevel: env.LOG_LEVEL,
        googleCredentialsPath: includePaths ? env.GOOGLE_APPLICATION_CREDENTIALS ?? null : null
      };
      return {
        content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent
      };
    }
  );

  server.registerTool(
    "list_sites",
    {
      title: "List Search Console Sites",
      description: "List all Search Console properties accessible to the configured service account."
    },
    async () => {
      try {
        const result = await listSites(createGscClient());
        logger.info("Handled list_sites", { rowCount: result.rowCount });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("list_sites failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("list_sites", error);
      }
    }
  );

  server.registerTool(
    "top_queries",
    {
      title: "Top Search Queries",
      description:
        "Return the top search queries from Google Search Console for a site over a preset or custom date range. Sort by clicks, impressions, CTR, or position. Optional country/device filtering.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(25),
        sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final"),
        countryFilter: z.string().length(3).optional(),
        deviceFilter: z.enum(["DESKTOP", "MOBILE", "TABLET"]).optional()
      }
    },
    async (input) => {
      try {
        const result = await getTopQueries(createGscClient(), input as any);
        logger.info("Handled top_queries", { siteUrl: result.siteUrl, sortBy: input.sortBy, rowCount: result.rowCount });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("top_queries failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("top_queries", error);
      }
    }
  );

  server.registerTool(
    "top_pages",
    {
      title: "Top Landing Pages from Search",
      description:
        "Return the top pages by organic search performance for a site over a preset or custom date range. Sort by clicks, impressions, CTR, or position. Optional substring page filter, country, device.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(25),
        sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final"),
        pageContains: z.string().optional(),
        countryFilter: z.string().length(3).optional(),
        deviceFilter: z.enum(["DESKTOP", "MOBILE", "TABLET"]).optional()
      }
    },
    async (input) => {
      try {
        const result = await getTopPages(createGscClient(), input as any);
        logger.info("Handled top_pages", { siteUrl: result.siteUrl, sortBy: input.sortBy, rowCount: result.rowCount });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("top_pages failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("top_pages", error);
      }
    }
  );

  server.registerTool(
    "traffic_overview",
    {
      title: "Search Console Traffic Overview",
      description:
        "Return a Search Console KPI block for a site over a preset or custom date range: total clicks, total impressions, average CTR, average position. Use this when the user wants a quick organic-search KPI summary without per-row detail.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final")
      }
    },
    async (input) => {
      try {
        const result = await getTrafficOverview(createGscClient(), input as any);
        logger.info("Handled traffic_overview", { siteUrl: result.siteUrl });
        return {
          content: [{ type: "text", text: result.summary }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("traffic_overview failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("traffic_overview", error);
      }
    }
  );

  server.registerTool(
    "compare_periods",
    {
      title: "Compare Search Console Periods",
      description:
        "Compare clicks, impressions, CTR, and average position across two periods: WoW (last 7d vs prior 7d), MoM (last 30d vs prior 30d), YoY (last 30d vs same 30d a year ago), or previous_period. Returns totals + absolute and percentage deltas. Custom startDate/endDate overrides the comparison preset and uses an equal-length prior window.",
      inputSchema: {
        siteUrl: z.string().optional(),
        comparison: z.enum(["wow", "mom", "yoy", "previous_period"]).default("wow"),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final"),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }
    },
    async (input) => {
      try {
        const result = await comparePeriods(createGscClient(), input as any);
        logger.info("Handled compare_periods", { siteUrl: result.siteUrl, comparison: result.comparison });
        return {
          content: [{ type: "text", text: result.summary }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("compare_periods failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("compare_periods", error);
      }
    }
  );

  server.registerTool(
    "queries_for_page",
    {
      title: "Queries For Page",
      description:
        "Reverse lookup: given a page URL, return the top organic search queries that drove clicks/impressions to it. Use matchType='contains' to match a path prefix or substring instead of exact URL.",
      inputSchema: {
        siteUrl: z.string().optional(),
        page: z.string().min(1),
        matchType: z.enum(["equals", "contains"]).default("equals"),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(25),
        sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
        dataState: z.enum(["final", "all"]).default("final")
      }
    },
    async (input) => {
      try {
        const result = await getQueriesForPage(createGscClient(), input as any);
        logger.info("Handled queries_for_page", { siteUrl: result.siteUrl, page: result.page, rowCount: result.rowCount });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("queries_for_page failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("queries_for_page", error);
      }
    }
  );

  server.registerTool(
    "inspect_url",
    {
      title: "URL Inspection",
      description:
        "Run Google's URL Inspection API on a specific URL: index status (verdict, coverage, robots.txt state, last crawl), canonical match, sitemap inclusion, mobile usability, and rich results detection. Useful when the user asks why a page isn't indexed or what state Google sees it in.",
      inputSchema: {
        siteUrl: z.string().optional(),
        inspectionUrl: z.string().min(1),
        languageCode: z.string().min(2).max(8).default("en")
      }
    },
    async (input) => {
      try {
        const result = await inspectUrl(createGscClient(), input as any);
        logger.info("Handled inspect_url", { siteUrl: result.siteUrl, verdict: result.verdict });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("inspect_url failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("inspect_url", error);
      }
    }
  );

  server.registerTool(
    "country_breakdown",
    {
      title: "Country Breakdown",
      description:
        "Break down Search Console performance by country (top markets) for a site over a preset or custom date range. Returns per-country clicks/impressions/CTR/position plus click share. Useful for multi-market sites.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().int().min(1).max(250).default(20),
        sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final")
      }
    },
    async (input) => {
      try {
        const result = await getCountryBreakdown(createGscClient(), input as any);
        logger.info("Handled country_breakdown", { siteUrl: result.siteUrl, rowCount: result.rowCount });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("country_breakdown failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("country_breakdown", error);
      }
    }
  );

  server.registerTool(
    "device_breakdown",
    {
      title: "Device Breakdown",
      description:
        "Split Search Console performance by device (DESKTOP, MOBILE, TABLET) for a site over a preset or custom date range. Returns clicks/impressions/CTR/position per device plus click and impression shares.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final")
      }
    },
    async (input) => {
      try {
        const result = await getDeviceBreakdown(createGscClient(), input as any);
        logger.info("Handled device_breakdown", { siteUrl: result.siteUrl, rowCount: result.rowCount });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("device_breakdown failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("device_breakdown", error);
      }
    }
  );

  server.registerTool(
    "branded_vs_non_branded",
    {
      title: "Branded vs Non-Branded Split",
      description:
        "Split Search Console traffic into branded vs non-branded based on a regex against the query. Default brand regex: 'jollyroom'. Returns clicks/impressions/CTR/position for each segment plus click share.",
      inputSchema: {
        siteUrl: z.string().optional(),
        brandRegex: z.string().default("jollyroom"),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final")
      }
    },
    async (input) => {
      try {
        const result = await getBrandedVsNonBranded(createGscClient(), input as any);
        logger.info("Handled branded_vs_non_branded", { siteUrl: result.siteUrl });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("branded_vs_non_branded failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("branded_vs_non_branded", error);
      }
    }
  );

  server.registerTool(
    "ctr_opportunities",
    {
      title: "CTR Opportunities",
      description:
        "Find queries where the site has search visibility but is underperforming on CTR — high impressions, position 5-20, or CTR below an expected benchmark for the rank. Returns ranked candidates with potential additional clicks if CTR reached the position-based benchmark. Pure SEO opportunity hunter.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        minImpressions: z.number().int().min(1).default(100),
        minPosition: z.number().min(1).default(5),
        maxPosition: z.number().min(1).default(20),
        maxCtr: z.number().min(0).max(1).default(0.05),
        requireBothFilters: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(25),
        candidatePoolSize: z.number().int().min(50).max(5000).default(1000),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final")
      }
    },
    async (input) => {
      try {
        const result = await getCtrOpportunities(createGscClient(), input as any);
        logger.info("Handled ctr_opportunities", { siteUrl: result.siteUrl, rowCount: result.rowCount, candidatesScanned: result.candidatesScanned });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("ctr_opportunities failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("ctr_opportunities", error);
      }
    }
  );

  server.registerTool(
    "search_appearance_breakdown",
    {
      title: "Search Appearance Breakdown",
      description:
        "Break down Search Console performance by SERP appearance type (rich results, FAQ snippet, video carousel, AMP, organization logo, etc.). Useful for measuring impact of structured-data investments. Cannot be combined with other dimensions or filters per Google's API.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final")
      }
    },
    async (input) => {
      try {
        const result = await getSearchAppearanceBreakdown(createGscClient(), input as any);
        logger.info("Handled search_appearance_breakdown", { siteUrl: result.siteUrl, rowCount: result.rowCount });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("search_appearance_breakdown failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("search_appearance_breakdown", error);
      }
    }
  );

  server.registerTool(
    "time_series",
    {
      title: "Time Series",
      description:
        "Daily / weekly / monthly trend for a single GSC metric (clicks, impressions, CTR, or avg position) with an optional query and/or page filter. Returns a sparkline plus per-bucket values. Use for trend visualization without external tooling.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        granularity: z.enum(["day", "week", "month"]).default("day"),
        metric: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
        queryFilter: z.string().optional(),
        queryMatchType: z.enum(["equals", "contains", "includingRegex"]).default("contains"),
        pageFilter: z.string().optional(),
        pageMatchType: z.enum(["equals", "contains"]).default("contains"),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final")
      }
    },
    async (input) => {
      try {
        const result = await getTimeSeries(createGscClient(), input as any);
        logger.info("Handled time_series", { siteUrl: result.siteUrl, granularity: result.granularity, rowCount: result.rowCount });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("time_series failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("time_series", error);
      }
    }
  );

  server.registerTool(
    "cannibalization_check",
    {
      title: "Keyword Cannibalization Check",
      description:
        "Find queries where multiple pages from the site are competing on similar positions — typical SEO problem where two pages dilute each other's ranking. Returns groups of queries with their competing pages, sorted by total impressions.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        minImpressionsPerPage: z.number().int().min(1).default(20),
        maxPositionGap: z.number().min(0).default(10),
        maxAveragePosition: z.number().min(1).default(30),
        minPagesPerQuery: z.number().int().min(2).default(2),
        limit: z.number().int().min(1).max(100).default(20),
        candidatePoolSize: z.number().int().min(100).max(5000).default(2000),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final")
      }
    },
    async (input) => {
      try {
        const result = await getCannibalizationCheck(createGscClient(), input as any);
        logger.info("Handled cannibalization_check", { siteUrl: result.siteUrl, rowCount: result.rowCount });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("cannibalization_check failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("cannibalization_check", error);
      }
    }
  );

  server.registerTool(
    "list_sitemaps",
    {
      title: "List Sitemaps",
      description:
        "List all sitemaps submitted to Search Console for a site, with submission and last-fetch timestamps, error/warning counts, and per-content-type indexed counts. One-shot SEO health check.",
      inputSchema: {
        siteUrl: z.string().optional()
      }
    },
    async (input) => {
      try {
        const result = await listSitemaps(createGscClient(), input as any);
        logger.info("Handled list_sitemaps", { siteUrl: result.siteUrl, rowCount: result.rowCount });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("list_sitemaps failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("list_sitemaps", error);
      }
    }
  );

  server.registerTool(
    "position_movement",
    {
      title: "Position Movement",
      description:
        "Compare query positions WoW or MoM and surface biggest winners (improved position) and losers (dropped position). Filtered to queries with a minimum impression threshold to drop noise. Direction can be 'winners', 'losers', or 'both'.",
      inputSchema: {
        siteUrl: z.string().optional(),
        comparison: z.enum(["wow", "mom"]).default("mom"),
        minImpressions: z.number().int().min(1).default(50),
        limit: z.number().int().min(1).max(100).default(20),
        candidatePoolSize: z.number().int().min(100).max(5000).default(1000),
        direction: z.enum(["winners", "losers", "both"]).default("both"),
        searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
        dataState: z.enum(["final", "all"]).default("final")
      }
    },
    async (input) => {
      try {
        const result = await getPositionMovement(createGscClient(), input as any);
        logger.info("Handled position_movement", { siteUrl: result.siteUrl, comparison: result.comparison, compared: result.counts.compared });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("position_movement failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("position_movement", error);
      }
    }
  );

  server.registerTool(
    "query_performance",
    {
      title: "Query Performance Breakdown",
      description:
        "Drill into a specific query (or queries matching a pattern) on a site. Returns total clicks/impressions/CTR/position plus a per-page (or per-date / per-country / per-device) breakdown.",
      inputSchema: {
        siteUrl: z.string().optional(),
        query: z.string().min(1),
        matchType: z.enum(["equals", "contains", "notContains"]).default("equals"),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        breakdownBy: z.enum(["page", "date", "country", "device"]).default("page"),
        limit: z.number().int().min(1).max(1000).default(25),
        sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
        dataState: z.enum(["final", "all"]).default("final")
      }
    },
    async (input) => {
      try {
        const result = await getQueryPerformance(createGscClient(), input as any);
        logger.info("Handled query_performance", { siteUrl: result.siteUrl, query: result.query, rowCount: result.rowCount });
        return {
          content: [{ type: "text", text: `${result.summary}\n\n${result.preview}` }],
          structuredContent: result
        };
      } catch (error) {
        logger.error("query_performance failed", { message: error instanceof Error ? error.message : "unknown" });
        return toolError("query_performance", error);
      }
    }
  );

  return server;
}
