import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
    async () => ({
      content: [{ type: "text", text: "pong" }],
      structuredContent: { ok: true, service: "mcp-search-console" }
    })
  );

  return server;
}
