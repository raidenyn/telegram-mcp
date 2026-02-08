import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/telegram.js";

const server = new McpServer({
  name: "telegram-mcp-server",
  version: "1.0.0",
});

registerTools(server);

const TRANSPORT = process.env.TRANSPORT || "stdio";

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Telegram MCP server running on stdio");
}

async function runHttp(): Promise<void> {
  const { createHttpServer } = await import("./http.js");
  await createHttpServer(server);
}

const run = TRANSPORT === "http" ? runHttp : runStdio;
run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
