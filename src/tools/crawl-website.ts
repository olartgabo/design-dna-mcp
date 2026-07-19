import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../server.js";
import { crawlWebsite } from "../capture/crawler.js";
import { toToolError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

export function registerCrawlWebsite(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "crawl_website",
    {
      description:
        "Crawl a website and capture its design evidence: full-page and per-section screenshots, " +
        "DOM snapshot, computed styles, font hierarchy, color palette, spacing scale, and declared " +
        "CSS motion (keyframes/transitions). Creates a new capture version each time. " +
        "Returns a compact summary with the captureId to use with extract_components.",
      inputSchema: {
        url: z.string().describe("Full http(s) URL of the page to crawl, e.g. https://example.com"),
      },
    },
    async ({ url }) => {
      try {
        logger.info(`crawling ${url}`);
        const summary = await crawlWebsite(ctx.config, ctx.db, url);
        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      } catch (err) {
        logger.error(`crawl failed for ${url}:`, err);
        return toToolError(err);
      }
    },
  );
}
