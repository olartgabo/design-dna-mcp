import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import type { DB } from "./db/database.js";

export interface AppContext {
  config: Config;
  db: DB;
}

export function createServer(ctx: AppContext): McpServer {
  const server = new McpServer({
    name: "design-research-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "ping",
    {
      description: "Health check. Returns server status and library size.",
      inputSchema: {},
    },
    async () => {
      const { n } = ctx.db.prepare("SELECT COUNT(*) AS n FROM components").get() as {
        n: number;
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: "ok", components: n, dataDir: ctx.config.dataDir }),
          },
        ],
      };
    },
  );

  return server;
}
