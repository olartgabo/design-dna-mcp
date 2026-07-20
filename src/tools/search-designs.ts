import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../server.js";
import { makeVoyageEmbedder } from "../embeddings/voyage.js";
import { searchDesigns } from "../library/search.js";
import { toToolError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

export function registerSearchDesigns(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "search_designs",
    {
      description:
        "Search the library grouped by source website — the \"sites like this\" view. " +
        'Queries like "editorial portfolio" or "technical dashboard" return the websites whose ' +
        "saved components best match, with their top-matching components listed per site.",
      inputSchema: {
        query: z.string().describe("Natural-language search query"),
        k: z.number().int().min(1).max(25).default(10).describe("Max sites"),
      },
    },
    async ({ query, k }) => {
      try {
        const embedder = makeVoyageEmbedder(ctx.config);
        const { sites, librarySize } = await searchDesigns(ctx.db, embedder, query, k);
        const payload =
          librarySize === 0
            ? {
                sites: [],
                message:
                  "The library is empty. Crawl a site, extract components, and save some first.",
              }
            : { sites, librarySize };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        logger.error("search_designs failed:", err);
        return toToolError(err);
      }
    },
  );
}
