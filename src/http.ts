import express from "express";
import { randomUUID } from "crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const PORT = parseInt(process.env.PORT || "3000");
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";

export async function createHttpServer(server: McpServer): Promise<void> {
  const app = express();
  app.use(express.json());

  // Bearer token auth middleware
  if (AUTH_TOKEN) {
    app.use((req, res, next) => {
      const header = req.headers.authorization;
      if (!header || header !== `Bearer ${AUTH_TOKEN}`) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    });
  }

  const sessions = new Map<string, StreamableHTTPServerTransport>();

  app.all("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    if (sessionId && !sessions.has(sessionId)) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // New session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    await server.connect(transport);

    if (transport.sessionId) {
      sessions.set(transport.sessionId, transport);
    }

    await transport.handleRequest(req, res);
  });

  app.listen(PORT, () => {
    console.error(`Telegram MCP server running on http://localhost:${PORT}/mcp`);
    if (AUTH_TOKEN) {
      console.error("Bearer token authentication enabled");
    } else {
      console.error("WARNING: No AUTH_TOKEN set, server is unprotected!");
    }
  });
}
