import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../server.js";
import { crawlWebsite } from "../capture/crawler.js";
import { extractComponents } from "../analysis/extract.js";
import { makeMessageCreator } from "../analysis/anthropic.js";
import { getCapture, getLatestCaptureByUrl, type CandidateRow, type CaptureRow } from "../db/repo.js";
import { AppError, toToolError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

/**
 * Best evidence image for a candidate: the viewport slice containing the
 * bbox center; full page as fallback. (Precise element crops are a v2 concern —
 * model-reported coordinates on downscaled images are not reliable enough.)
 */
export function assignCropPath(capture: CaptureRow, candidate: CandidateRow): string | null {
  if (candidate.bbox) {
    const centerY = candidate.bbox.y + candidate.bbox.height / 2;
    const slice = Math.floor(centerY / capture.viewport_h) + 1;
    const slicePath = join(capture.dir_path, `section-${String(slice).padStart(2, "0")}.png`);
    if (existsSync(slicePath)) return slicePath;
  }
  const fullPath = join(capture.dir_path, "full.png");
  return existsSync(fullPath) ? fullPath : null;
}

export function registerExtractComponents(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "extract_components",
    {
      description:
        "Analyze a captured website with Claude and decompose it into reusable design component " +
        "candidates (navigation, hero, typography system, hover effects, motion, etc.), each with " +
        "category, description, style tags, and metadata. Candidates are cached but NOT saved to " +
        "the library — review them and call save_component to keep the good ones. " +
        "Accepts a URL (crawls it first if never captured) or a captureId from crawl_website.",
      inputSchema: {
        url: z.string().optional().describe("Website URL. Uses the latest capture, or crawls first."),
        captureId: z.number().optional().describe("Specific capture id from crawl_website."),
        focus: z
          .string()
          .optional()
          .describe('Optional focus, e.g. "only navigation and typography"'),
      },
    },
    async ({ url, captureId, focus }) => {
      try {
        let capture: CaptureRow | null = null;
        if (captureId != null) {
          capture = getCapture(ctx.db, captureId);
          if (!capture) throw new AppError("CAPTURE_NOT_FOUND", `No capture with id ${captureId}`);
        } else if (url) {
          capture = getLatestCaptureByUrl(ctx.db, url);
          if (!capture) {
            logger.info(`no capture for ${url}, crawling first`);
            const summary = await crawlWebsite(ctx.config, ctx.db, url);
            capture = getCapture(ctx.db, summary.captureId);
          }
        }
        if (!capture) {
          throw new AppError("INVALID_INPUT", "Provide either url or captureId.");
        }

        const createMessage = makeMessageCreator(ctx.config);
        const rows = await extractComponents(ctx.config, ctx.db, capture, createMessage, { focus });

        const candidates = rows.map((c) => ({
          candidateId: c.id,
          name: c.name,
          category: c.category,
          description: c.description,
          tags: c.tags,
          metadata: c.metadata,
          cropPath: assignCropPath(capture, c),
        }));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  captureId: capture.id,
                  url: capture.url,
                  candidates,
                  hint: "Use save_component with a candidateId (or saveAll) to add these to the library.",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        logger.error("extract_components failed:", err);
        return toToolError(err);
      }
    },
  );
}
