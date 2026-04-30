import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

const INTERNAL_MCP_URL = process.env.GSC_INTERNAL_MCP_URL?.trim();
const INTERNAL_MCP_AUTH_TOKEN = process.env.GSC_INTERNAL_MCP_AUTH_TOKEN?.trim();

if (!INTERNAL_MCP_URL) {
  throw new Error("Missing GSC_INTERNAL_MCP_URL for the internal Search Console MCP DXT proxy.");
}

function normalizeMcpUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/mcp";
    return url;
  }
  if (!url.pathname.endsWith("/mcp")) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/mcp`;
  }
  return url;
}

function createBackendClient() {
  const headers = INTERNAL_MCP_AUTH_TOKEN
    ? { Authorization: `Bearer ${INTERNAL_MCP_AUTH_TOKEN}` }
    : undefined;

  const transport = new StreamableHTTPClientTransport(normalizeMcpUrl(INTERNAL_MCP_URL!), {
    requestInit: headers ? { headers } : undefined
  });

  const client = new Client(
    { name: "gsc-jollyroom-internal-dxt", version: "0.1.0" },
    { capabilities: {} }
  );

  return { client, transport };
}

let activeClient: Client | null = null;
let activeTransport: StreamableHTTPClientTransport | null = null;
let connectingPromise: Promise<Client> | null = null;

async function ensureConnected(): Promise<Client> {
  if (activeClient) return activeClient;
  if (connectingPromise) return connectingPromise;
  connectingPromise = (async () => {
    const { client, transport } = createBackendClient();
    await client.connect(transport);
    activeClient = client;
    activeTransport = transport;
    return client;
  })();
  try {
    return await connectingPromise;
  } finally {
    connectingPromise = null;
  }
}

async function reconnect(): Promise<Client> {
  const oldTransport = activeTransport;
  activeClient = null;
  activeTransport = null;
  if (oldTransport) {
    try {
      await oldTransport.close();
    } catch {
      // ignore — transport may already be dead
    }
  }
  return ensureConnected();
}

function isSessionLostError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /no valid session id|session not found|invalid session|HTTP 4\d\d/i.test(message);
}

async function forwardToolCall(name: string, args?: Record<string, unknown>) {
  const callOnce = async (client: Client) => {
    const result = await client.callTool({ name, arguments: args });
    if (!("content" in result)) {
      throw new Error(`Unexpected tool result shape returned by backend for ${name}.`);
    }
    return {
      content: result.content,
      structuredContent: result.structuredContent,
      isError: result.isError
    };
  };

  let client = await ensureConnected();
  try {
    return await callOnce(client);
  } catch (error) {
    if (!isSessionLostError(error)) throw error;
    console.error(`[dxt-proxy] backend session lost (${error instanceof Error ? error.message : "unknown"}), reconnecting...`);
    client = await reconnect();
    return await callOnce(client);
  }
}

async function main() {
  await ensureConnected();

  const server = new McpServer({ name: "gsc-jollyroom-internal", version: "0.1.0" });

  const presetEnum = z.enum([
    "last_7_days",
    "last_28_days",
    "last_30_days",
    "last_90_days",
    "last_365_days",
    "last_16_months"
  ]);
  const sortByEnum = z.enum(["clicks", "impressions", "ctr", "position"]);
  const searchTypeEnum = z.enum(["web", "image", "video", "news", "discover", "googleNews"]);
  const dataStateEnum = z.enum(["final", "all"]);
  const deviceEnum = z.enum(["DESKTOP", "MOBILE", "TABLET"]);

  server.registerTool(
    "ping",
    { title: "Ping", description: "Health check for the internal GSC MCP backend." },
    async () => forwardToolCall("ping")
  );

  server.registerTool(
    "get_current_config",
    {
      title: "Current Config",
      description: "Return sanitized runtime configuration from the internal GSC MCP backend.",
      inputSchema: { includePaths: z.boolean().default(false) }
    },
    async (input) => forwardToolCall("get_current_config", input)
  );

  server.registerTool(
    "list_sites",
    {
      title: "List Search Console Sites",
      description: "List all Search Console properties accessible to the configured service account."
    },
    async () => forwardToolCall("list_sites")
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
        sortBy: sortByEnum.default("clicks"),
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final"),
        countryFilter: z.string().length(3).optional(),
        deviceFilter: deviceEnum.optional()
      }
    },
    async (input) => forwardToolCall("top_queries", input)
  );

  server.registerTool(
    "top_pages",
    {
      title: "Top Landing Pages from Search",
      description:
        "Return the top pages by organic search performance for a site. Optional substring page filter, country, device.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(25),
        sortBy: sortByEnum.default("clicks"),
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final"),
        pageContains: z.string().optional(),
        countryFilter: z.string().length(3).optional(),
        deviceFilter: deviceEnum.optional()
      }
    },
    async (input) => forwardToolCall("top_pages", input)
  );

  server.registerTool(
    "traffic_overview",
    {
      title: "Search Console Traffic Overview",
      description:
        "Return a Search Console KPI block for a site over a preset or custom date range: total clicks, total impressions, average CTR, average position.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final")
      }
    },
    async (input) => forwardToolCall("traffic_overview", input)
  );

  server.registerTool(
    "compare_periods",
    {
      title: "Compare Search Console Periods",
      description:
        "Compare clicks, impressions, CTR, and average position across two periods: WoW, MoM, YoY, or previous_period. Returns totals + absolute and percentage deltas.",
      inputSchema: {
        siteUrl: z.string().optional(),
        comparison: z.enum(["wow", "mom", "yoy", "previous_period"]).default("wow"),
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final"),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }
    },
    async (input) => forwardToolCall("compare_periods", input)
  );

  server.registerTool(
    "queries_for_page",
    {
      title: "Queries For Page",
      description:
        "Reverse lookup: given a page URL, return the top organic search queries that drove clicks/impressions to it.",
      inputSchema: {
        siteUrl: z.string().optional(),
        page: z.string().min(1),
        matchType: z.enum(["equals", "contains"]).default("equals"),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(25),
        sortBy: sortByEnum.default("clicks"),
        dataState: dataStateEnum.default("final")
      }
    },
    async (input) => forwardToolCall("queries_for_page", input)
  );

  server.registerTool(
    "inspect_url",
    {
      title: "URL Inspection",
      description:
        "Run Google's URL Inspection API on a specific URL: index status, coverage, last crawl, canonical match, sitemap inclusion, mobile usability, rich results.",
      inputSchema: {
        siteUrl: z.string().optional(),
        inspectionUrl: z.string().min(1),
        languageCode: z.string().min(2).max(8).default("en")
      }
    },
    async (input) => forwardToolCall("inspect_url", input)
  );

  server.registerTool(
    "country_breakdown",
    {
      title: "Country Breakdown",
      description:
        "Break down Search Console performance by country (top markets) for a site. Returns per-country clicks/impressions/CTR/position plus click share.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().int().min(1).max(250).default(20),
        sortBy: sortByEnum.default("clicks"),
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final")
      }
    },
    async (input) => forwardToolCall("country_breakdown", input)
  );

  server.registerTool(
    "device_breakdown",
    {
      title: "Device Breakdown",
      description:
        "Split Search Console performance by device (DESKTOP / MOBILE / TABLET). Returns clicks/impressions/CTR/position per device plus shares.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final")
      }
    },
    async (input) => forwardToolCall("device_breakdown", input)
  );

  server.registerTool(
    "branded_vs_non_branded",
    {
      title: "Branded vs Non-Branded Split",
      description:
        "Split Search Console traffic into branded vs non-branded by regex on the query. Returns clicks/impressions/CTR/position and share for each segment.",
      inputSchema: {
        siteUrl: z.string().optional(),
        brandRegex: z.string().default("jollyroom"),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final")
      }
    },
    async (input) => forwardToolCall("branded_vs_non_branded", input)
  );

  server.registerTool(
    "ctr_opportunities",
    {
      title: "CTR Opportunities",
      description:
        "Find queries with high impressions but underperforming CTR — opinionated SEO opportunity finder. Returns potential additional clicks if CTR reached a position-based benchmark.",
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
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final")
      }
    },
    async (input) => forwardToolCall("ctr_opportunities", input)
  );

  server.registerTool(
    "search_appearance_breakdown",
    {
      title: "Search Appearance Breakdown",
      description:
        "Break down GSC performance by SERP appearance type (rich results, FAQ, video carousel, AMP, etc.). API restriction: cannot be combined with other dimensions/filters.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        sortBy: sortByEnum.default("clicks"),
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final")
      }
    },
    async (input) => forwardToolCall("search_appearance_breakdown", input)
  );

  server.registerTool(
    "time_series",
    {
      title: "Time Series",
      description:
        "Daily/weekly/monthly trend for a single GSC metric with optional query/page filter. Returns sparkline + per-bucket values.",
      inputSchema: {
        siteUrl: z.string().optional(),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        granularity: z.enum(["day", "week", "month"]).default("day"),
        metric: sortByEnum.default("clicks"),
        queryFilter: z.string().optional(),
        queryMatchType: z.enum(["equals", "contains", "includingRegex"]).default("contains"),
        pageFilter: z.string().optional(),
        pageMatchType: z.enum(["equals", "contains"]).default("contains"),
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final")
      }
    },
    async (input) => forwardToolCall("time_series", input)
  );

  server.registerTool(
    "cannibalization_check",
    {
      title: "Keyword Cannibalization Check",
      description:
        "Find queries where multiple pages from the same site compete on close positions — SEO cleanup target.",
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
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final")
      }
    },
    async (input) => forwardToolCall("cannibalization_check", input)
  );

  server.registerTool(
    "list_sitemaps",
    {
      title: "List Sitemaps",
      description:
        "List submitted sitemaps with timestamps, error/warning counts, and per-content-type indexing stats.",
      inputSchema: {
        siteUrl: z.string().optional()
      }
    },
    async (input) => forwardToolCall("list_sitemaps", input)
  );

  server.registerTool(
    "position_movement",
    {
      title: "Position Movement",
      description:
        "WoW/MoM query position comparison — surface biggest winners (improved position) and losers (dropped position).",
      inputSchema: {
        siteUrl: z.string().optional(),
        comparison: z.enum(["wow", "mom"]).default("mom"),
        minImpressions: z.number().int().min(1).default(50),
        limit: z.number().int().min(1).max(100).default(20),
        candidatePoolSize: z.number().int().min(100).max(5000).default(1000),
        direction: z.enum(["winners", "losers", "both"]).default("both"),
        searchType: searchTypeEnum.default("web"),
        dataState: dataStateEnum.default("final")
      }
    },
    async (input) => forwardToolCall("position_movement", input)
  );

  server.registerTool(
    "query_performance",
    {
      title: "Query Performance Breakdown",
      description:
        "Drill into a specific query (or pattern) on a site. Returns totals plus a per-page (or date/country/device) breakdown.",
      inputSchema: {
        siteUrl: z.string().optional(),
        query: z.string().min(1),
        matchType: z.enum(["equals", "contains", "notContains"]).default("equals"),
        preset: presetEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        breakdownBy: z.enum(["page", "date", "country", "device"]).default("page"),
        limit: z.number().int().min(1).max(1000).default(25),
        sortBy: sortByEnum.default("clicks"),
        dataState: dataStateEnum.default("final")
      }
    },
    async (input) => forwardToolCall("query_performance", input)
  );

  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  console.error(`gsc-jollyroom-internal DXT proxy connected to ${normalizeMcpUrl(INTERNAL_MCP_URL).toString()}`);

  const shutdown = async () => {
    await server.close();
    if (activeTransport) {
      try {
        await activeTransport.close();
      } catch {
        // ignore
      }
    }
  };
  process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
}

main().catch((error) => {
  console.error("Fatal DXT proxy error", error);
  process.exit(1);
});
