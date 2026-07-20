import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../server.js";
import { makeVoyageEmbedder } from "../embeddings/voyage.js";
import { findComponents } from "../library/search.js";
import { COMPONENT_CATEGORIES } from "../db/schema.js";
import { toToolError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

export function registerFindComponents(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "find_components",
    {
      description:
        "Semantic search over the saved component library. Natural-language queries like " +
        '"sticky editorial navigation", "large page numbers", or "image reveal hover" return the ' +
        "closest components with metadata, source URL, similarity score, and evidence screenshot path.",
      inputSchema: {
        query: z.string().describe("Natural-language search query"),
        k: z.number().int().min(1).max(50).default(10).describe("Max results"),
        category: z.enum(COMPONENT_CATEGORIES).optional().describe("Filter by category"),
        tag: z.string().optional().describe("Filter by style tag, e.g. editorial"),
        theme: z.string().optional().describe("Filter by theme, e.g. dark"),
        sourceUrl: z.string().optional().describe("Filter by source URL substring"),
      },
    },
    async ({ query, k, category, tag, theme, sourceUrl }) => {
      try {
        const embedder = makeVoyageEmbedder(ctx.config);
        const { hits, librarySize } = await findComponents(ctx.db, embedder, query, k, {
          category,
          tag,
          theme,
          sourceUrl,
        });
        const payload =
          librarySize === 0
            ? {
                results: [],
                message:
                  "The library is empty. Crawl a site, extract components, and save some first.",
              }
            : {
                results: hits.map((h) => ({
                  componentId: h.id,
                  name: h.name,
                  category: h.category,
                  description: h.description,
                  tags: h.tags,
                  metadata: h.metadata,
                  sourceUrl: h.sourceUrl,
                  similarity: h.similarity,
                  cropPath: h.cropPath,
                })),
                librarySize,
              };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      } catch (err) {
        logger.error("find_components failed:", err);
        return toToolError(err);
      }
    },
  );
}
