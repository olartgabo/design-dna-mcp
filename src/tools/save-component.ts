import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "../server.js";
import { makeVoyageEmbedder } from "../embeddings/voyage.js";
import { saveByCandidateId, saveAllFromCapture, saveInline } from "../library/save.js";
import { COMPONENT_CATEGORIES } from "../db/schema.js";
import { AppError, toToolError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

export function registerSaveComponent(server: McpServer, ctx: AppContext): void {
  server.registerTool(
    "save_component",
    {
      description:
        "Save design components into the searchable library (with a Voyage embedding computed at " +
        "save time). Three modes: pass candidateId to save one extraction candidate; pass " +
        "captureId + saveAll to save every unsaved candidate from a capture; or pass component " +
        "to save a manually-described component. Saving the same (sourceUrl, name) again updates " +
        "it instead of duplicating.",
      inputSchema: {
        candidateId: z.number().optional().describe("Candidate id from extract_components"),
        captureId: z.number().optional().describe("With saveAll: capture whose candidates to save"),
        saveAll: z.boolean().optional().describe("Save all unsaved candidates of captureId"),
        component: z
          .object({
            name: z.string(),
            category: z.enum(COMPONENT_CATEGORIES),
            description: z.string(),
            tags: z.array(z.string()).default([]),
            metadata: z
              .object({
                style: z.array(z.string()).optional(),
                complexity: z.enum(["low", "medium", "high"]).optional(),
                interaction: z.string().optional(),
                layout: z.string().optional(),
                theme: z.string().optional(),
                motion: z.string().optional(),
                spacing: z.string().optional(),
              })
              .default({}),
            sourceUrl: z.string(),
          })
          .optional()
          .describe("Inline component definition (manual save)"),
      },
    },
    async ({ candidateId, captureId, saveAll, component }) => {
      try {
        const embedder = makeVoyageEmbedder(ctx.config);
        let results;
        if (candidateId != null) {
          results = await saveByCandidateId(ctx.config, ctx.db, embedder, candidateId);
        } else if (saveAll && captureId != null) {
          results = await saveAllFromCapture(ctx.config, ctx.db, embedder, captureId);
        } else if (component) {
          results = await saveInline(ctx.config, ctx.db, embedder, component);
        } else {
          throw new AppError(
            "INVALID_INPUT",
            "Provide candidateId, or captureId with saveAll: true, or an inline component.",
          );
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ saved: results }, null, 2) }],
        };
      } catch (err) {
        logger.error("save_component failed:", err);
        return toToolError(err);
      }
    },
  );
}
