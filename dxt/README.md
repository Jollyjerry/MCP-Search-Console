# Search Console Jollyroom Internal — Claude Desktop Extension

Forwarder DXT for the internal Search Console MCP backend. Bundles a tiny stdio MCP server that proxies tool calls to the internal HTTP endpoint.

## User config (set in Claude Desktop on install)

- **Internal MCP URL** — `http://gsc-mcp.jollyroom.local:3001` or direct `http://<host>:3001/mcp`.
- **Internal MCP bearer token** — required when `MCP_AUTH_TOKEN` is enabled on the backend.

## What it exposes

Same tool surface as the backend (see repo README). The DXT is a thin proxy — every call is forwarded over MCP-over-HTTP to the internal server.
