import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { env } from "./config/env.js";
import { startHttpServer } from "./server/httpServer.js";
import { createMcpServer } from "./server/mcpServer.js";

async function main() {
  const args = new Set(process.argv.slice(2));
  const mode = args.has("--http") ? "http" : env.MCP_MODE;

  if (mode === "http") {
    await startHttpServer();
    return;
  }

  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-search-console MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal MCP server error", error);
  process.exit(1);
});
