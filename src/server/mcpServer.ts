import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";

import { env } from "../config/env.js";
import { createGscClient } from "../gsc/client.js";
import { listSites } from "../gsc/reports/listSites.js";
import { getQueryPerformance } from "../gsc/reports/queryPerformance.js";
import { getTopPages } from "../gsc/reports/topPages.js";
import { getTopQueries } from "../gsc/reports/topQueries.js";
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
