import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Config } from "../config.js";
import type { DB } from "../db/database.js";
import { insertCandidates, type CandidateRow, type CaptureRow, listCandidates } from "../db/repo.js";
import { COMPONENT_CATEGORIES } from "../db/schema.js";
import { AppError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import type { ComponentCandidate } from "../shared/types.js";
import { distillCapture } from "./distill.js";
import { EXTRACTION_SYSTEM_PROMPT, buildFocusInstruction } from "./prompts.js";
import type { MessageCreator } from "./anthropic.js";

const REPORT_TOOL: Anthropic.Tool = {
  name: "report_components",
  description: "Report the reusable design components found in this website.",
  input_schema: {
    type: "object",
    properties: {
      components: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            category: { type: "string", enum: [...COMPONENT_CATEGORIES] },
            description: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            metadata: {
              type: "object",
              properties: {
                style: { type: "array", items: { type: "string" } },
                complexity: { type: "string", enum: ["low", "medium", "high"] },
                interaction: { type: "string" },
                layout: { type: "string" },
                theme: { type: "string" },
                motion: { type: "string" },
                spacing: { type: "string" },
              },
            },
            selector: { type: "string" },
            bbox: {
              type: "object",
              properties: {
                x: { type: "number" },
                y: { type: "number" },
                width: { type: "number" },
                height: { type: "number" },
              },
              required: ["x", "y", "width", "height"],
            },
          },
          required: ["name", "category", "description", "tags", "metadata"],
        },
      },
    },
    required: ["components"],
  },
};

const candidateSchema = z.object({
  name: z.string().min(1),
  category: z.enum(COMPONENT_CATEGORIES).catch("other"),
  description: z.string().min(1),
  tags: z.array(z.string()).catch([]),
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
    .catch({}),
  selector: z.string().optional(),
  bbox: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional(),
});

const reportSchema = z.object({ components: z.array(candidateSchema) });

function imageBlock(path: string): Anthropic.ImageBlockParam {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: readFileSync(path).toString("base64"),
    },
  };
}

/**
 * One-shot Claude vision call: distilled capture + screenshots → component
 * candidates, persisted to the candidates table. Returns the inserted rows.
 */
export async function extractComponents(
  config: Config,
  db: DB,
  capture: CaptureRow,
  createMessage: MessageCreator,
  opts: { focus?: string } = {},
): Promise<CandidateRow[]> {
  const distilled = distillCapture(capture);

  const content: Anthropic.ContentBlockParam[] = [
    ...distilled.images.map((img) => imageBlock(img.path)),
    {
      type: "text",
      text:
        `Screenshots above (in order): ${distilled.images.map((i) => i.label).join("; ")}.\n\n` +
        `Distilled design data:\n${JSON.stringify(distilled.payload, null, 2)}` +
        buildFocusInstruction(opts.focus),
    },
  ];

  let response: Anthropic.Message;
  try {
    response = await createMessage({
      model: config.analysisModel,
      max_tokens: 16_000,
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "report_components" },
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new AppError("ANALYSIS_FAILED", `Claude analysis failed: ${message}`);
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    throw new AppError("ANALYSIS_FAILED", "Claude returned no report_components tool call.");
  }

  const parsed = reportSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new AppError("ANALYSIS_FAILED", `Unexpected analysis output shape: ${parsed.error.message}`);
  }

  const candidates: ComponentCandidate[] = parsed.data.components;
  logger.info(`extracted ${candidates.length} candidates from capture ${capture.id}`);
  insertCandidates(db, capture.id, candidates);
  return listCandidates(db, capture.id);
}
