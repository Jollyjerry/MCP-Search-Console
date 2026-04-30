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

async function forwardToolCall(
  client: Client,
  name: string,
  args?: Record<string, unknown>
) {
  const result = await client.callTool({ name, arguments: args });
  if (!("content" in result)) {
    throw new Error(`Unexpected tool result shape returned by backend for ${name}.`);
  }
  return {
    content: result.content,
    structuredContent: result.structuredContent,
    isError: result.isError
  };
}

async function main() {
  const { client, transport: backendTransport } = createBackendClient();
  await client.connect(backendTransport);
  await client.listTools();

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
    async () => forwardToolCall(client, "ping")
  );

  server.registerTool(
    "get_current_config",
    {
      title: "Current Config",
      description: "Return sanitized runtime configuration from the internal GSC MCP backend.",
      inputSchema: { includePaths: z.boolean().default(false) }
    },
    async (input) => forwardToolCall(client, "get_current_config", input)
  );

  server.registerTool(
    "list_sites",
    {
      title: "List Search Console Sites",
      description: "List all Search Console properties accessible to the configured service account."
    },
    async () => forwardToolCall(client, "list_sites")
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
    async (input) => forwardToolCall(client, "top_queries", input)
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
    async (input) => forwardToolCall(client, "top_pages", input)
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
    async (input) => forwardToolCall(client, "query_performance", input)
  );

  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  console.error(`gsc-jollyroom-internal DXT proxy connected to ${normalizeMcpUrl(INTERNAL_MCP_URL).toString()}`);

  const shutdown = async () => {
    await server.close();
    await backendTransport.close();
  };
  process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
}

main().catch((error) => {
  console.error("Fatal DXT proxy error", error);
  process.exit(1);
});
