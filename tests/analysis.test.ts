import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import { loadConfig, type Config } from "../src/config.js";
import { openDatabase, type DB } from "../src/db/database.js";
import { upsertSite, insertCapture, getCapture, type CaptureRow } from "../src/db/repo.js";
import { distillCapture } from "../src/analysis/distill.js";
import { extractComponents } from "../src/analysis/extract.js";
import { makeMessageCreator } from "../src/analysis/anthropic.js";
import { assignCropPath } from "../src/tools/extract-components.js";
import type { MotionRule } from "../src/shared/types.js";

let dir: string;
let db: DB;
let config: Config;

beforeEach(() => {
  dir = join(tmpdir(), `drm-an-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  config = loadConfig({ DESIGN_RESEARCH_DATA_DIR: dir, ANTHROPIC_API_KEY: "test-key" });
  db = openDatabase(join(dir, "db.sqlite"), 4);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A capture with an on-disk dir, styles.json, and fake screenshots. */
function makeCapture(overrides: { motion?: MotionRule[]; docHeight?: number } = {}): CaptureRow {
  const capDir = join(dir, "cap");
  mkdirSync(capDir, { recursive: true });
  writeFileSync(
    join(capDir, "styles.json"),
    JSON.stringify({
      docHeight: overrides.docHeight ?? 3000,
      outline: Array.from({ length: 200 }, (_, i) => ({
        tag: "section",
        text: `Section ${i} with a fairly long heading text repeated`,
        depth: i % 10,
      })),
    }),
  );
  // 1x1 transparent PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  writeFileSync(join(capDir, "full.png"), png);
  for (let i = 1; i <= 3; i++) writeFileSync(join(capDir, `section-0${i}.png`), png);

  const siteId = upsertSite(db, "https://example.com", "example.com", "Example");
  const id = insertCapture(db, {
    siteId,
    url: "https://example.com",
    pageTitle: "Example",
    viewportW: 1440,
    viewportH: 900,
    dirPath: capDir,
    palette: ["#111111", "#fafafa"],
    fonts: Array.from({ length: 12 }, (_, i) => ({
      family: `Font${i}`,
      usages: Array.from({ length: 8 }, (_, j) => ({ size: 10 + j, weight: 400, count: j })),
    })),
    spacing: [8, 16, 24, 64],
    motion:
      overrides.motion ??
      Array.from({ length: 80 }, (_, i) => ({
        kind: "keyframes" as const,
        name: `anim-${i}`,
        keyframes: Array.from({ length: 20 }, (_, j) => ({
          offset: `${j * 5}%`,
          declarations: { transform: `translateY(${j}px) scale(1.0${j}) rotate(${j}deg)` },
        })),
      })),
  });
  return getCapture(db, id)!;
}

describe("distillCapture", () => {
  it("caps payload size and image count on a huge capture", () => {
    const { payload, images } = distillCapture(makeCapture());
    expect(JSON.stringify(payload).length).toBeLessThanOrEqual(9000);
    expect(images.length).toBeLessThanOrEqual(6);
    expect(images[0]!.label).toBe("full page");
  });

  it("skips the full-page image when the page is taller than the API limit", () => {
    const { images } = distillCapture(makeCapture({ docHeight: 20_000 }));
    expect(images.every((i) => i.label !== "full page")).toBe(true);
    expect(images.length).toBeGreaterThan(0);
  });
});

describe("extractComponents", () => {
  const fakeResponse = (input: unknown): Anthropic.Message =>
    ({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: "tool_use", id: "toolu_test", name: "report_components", input }],
    }) as unknown as Anthropic.Message;

  it("parses, sanitizes, and persists candidates", async () => {
    const capture = makeCapture();
    const rows = await extractComponents(config, db, capture, async (params) => {
      expect(params.model).toBe("claude-sonnet-5");
      expect(params.tool_choice).toEqual({ type: "tool", name: "report_components" });
      return fakeResponse({
        components: [
          {
            name: "Editorial Navigation",
            category: "navigation",
            description: "Sticky nav with monospace labels",
            tags: ["editorial"],
            metadata: { theme: "dark", complexity: "low" },
            bbox: { x: 0, y: 0, width: 1440, height: 80 },
          },
          {
            name: "Weird Thing",
            category: "not-a-real-category", // sanitized to "other"
            description: "Something",
            tags: ["x"],
            metadata: {},
          },
        ],
      });
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.category).toBe("navigation");
    expect(rows[1]!.category).toBe("other");
    expect(rows[0]!.metadata.theme).toBe("dark");
  });

  it("throws ANALYSIS_FAILED on malformed output", async () => {
    const capture = makeCapture();
    await expect(
      extractComponents(config, db, capture, async () => fakeResponse({ nope: true })),
    ).rejects.toMatchObject({ code: "ANALYSIS_FAILED" });
  });

  it("makeMessageCreator requires the API key", () => {
    const noKey = loadConfig({ DESIGN_RESEARCH_DATA_DIR: dir });
    expect(() => makeMessageCreator(noKey)).toThrowError(/ANTHROPIC_API_KEY/);
  });
});

describe("assignCropPath", () => {
  it("maps bbox center to the containing slice, full page as fallback", async () => {
    const capture = makeCapture();
    const rows = await extractComponents(config, db, capture, async () =>
      ({
        id: "m", type: "message", role: "assistant", model: "m",
        stop_reason: "tool_use", stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{
          type: "tool_use", id: "t", name: "report_components",
          input: {
            components: [
              { name: "Nav", category: "navigation", description: "d", tags: [], metadata: {}, bbox: { x: 0, y: 0, width: 1440, height: 80 } },
              { name: "Mid", category: "cards", description: "d", tags: [], metadata: {}, bbox: { x: 0, y: 1900, width: 1440, height: 300 } },
              { name: "NoBox", category: "footer", description: "d", tags: [], metadata: {} },
            ],
          },
        }],
      }) as never,
    );
    expect(assignCropPath(capture, rows[0]!)).toMatch(/section-01\.png$/);
    expect(assignCropPath(capture, rows[1]!)).toMatch(/section-03\.png$/);
    expect(assignCropPath(capture, rows[2]!)).toMatch(/full\.png$/);
  });
});
