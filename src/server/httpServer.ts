import { randomUUID } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { createMcpServer } from "./mcpServer.js";

const logger = createLogger(env.LOG_LEVEL);

function isAuthorized(authorizationHeader: string | undefined) {
  if (!env.MCP_AUTH_TOKEN) return true;
  return authorizationHeader === `Bearer ${env.MCP_AUTH_TOKEN}`;
}

export async function startHttpServer() {
  const allowedHosts = env.ALLOWED_HOSTS
    ? env.ALLOWED_HOSTS.split(",").map((value) => value.trim()).filter(Boolean)
    : undefined;

  const app = createMcpExpressApp({ host: env.HOST, allowedHosts });
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const servers = new Map<string, ReturnType<typeof createMcpServer>>();

  app.get("/health", (_req: any, res: any) => {
    res.json({ ok: true, service: "mcp-search-console", mode: "http" });
  });

  app.post("/mcp", async (req: any, res: any) => {
    if (!isAuthorized(req.headers.authorization)) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
      return;
    }
    try {
      const sessionIdHeader = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId) transport = transports.get(sessionId);

      if (!transport) {
        if (!isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: No valid session ID provided" },
            id: null
          });
          return;
        }

        let initializedSessionId = "";
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (newSessionId) => {
            initializedSessionId = newSessionId;
            transports.set(newSessionId, transport!);
          }
        });

        const server = createMcpServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);

        if (initializedSessionId) servers.set(initializedSessionId, server);
        else await server.close();

        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error("HTTP MCP request failed", {
        message: error instanceof Error ? error.message : "Unknown HTTP error"
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null
        });
      }
    }
  });

  app.get("/mcp", (_req: any, res: any) => {
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
  });

  app.delete("/mcp", async (req: any, res: any) => {
    if (!isAuthorized(req.headers.authorization)) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
      return;
    }
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
    if (!sessionId) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No session ID provided" },
        id: null
      });
      return;
    }
    const transport = transports.get(sessionId);
    const server = servers.get(sessionId);
    if (!transport) {
      res.status(404).json({ jsonrpc: "2.0", error: { code: -32004, message: "Session not found" }, id: null });
      return;
    }
    await transport.handleRequest(req, res);
    await transport.close();
    transports.delete(sessionId);
    if (server) {
      await server.close();
      servers.delete(sessionId);
    }
  });

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info("mcp-search-console MCP server running on HTTP", {
      host: env.HOST,
      port: env.PORT,
      authEnabled: Boolean(env.MCP_AUTH_TOKEN)
    });
  });

  const shutdown = async () => {
    server.close();
    for (const transport of transports.values()) await transport.close();
    for (const mcpServer of servers.values()) await mcpServer.close();
  };

  process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
}
