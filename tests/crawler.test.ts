import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, rmSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { loadConfig, ensureDataDirs, type Config } from "../src/config.js";
import { openDatabase, type DB } from "../src/db/database.js";
import { getCapture } from "../src/db/repo.js";
import { crawlWebsite } from "../src/capture/crawler.js";
import { AppError } from "../src/shared/errors.js";
import { startFixtureServer } from "./helpers/fixture-server.js";

let server: Server;
let baseUrl: string;
let dir: string;
let config: Config;
let db: DB;

beforeAll(async () => {
  ({ server, baseUrl } = await startFixtureServer());
  dir = join(tmpdir(), `drm-crawl-${process.pid}-${Math.random().toString(36).slice(2)}`);
  config = loadConfig({ DESIGN_DNA_DATA_DIR: dir });
  ensureDataDirs(config);
  db = openDatabase(config.dbPath, config.embeddingDims);
});

afterAll(() => {
  db?.close();
  server?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("crawlWebsite (fixture site)", () => {
  it("captures screenshots, styles, palette, fonts, spacing, and motion", async () => {
    const summary = await crawlWebsite(config, db, `${baseUrl}/`);

    expect(summary.pageTitle).toContain("Studio Fixture");
    expect(summary.screenshotCount).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(summary.dirPath, "full.png"))).toBe(true);
    expect(existsSync(join(summary.dirPath, "section-01.png"))).toBe(true);
    expect(existsSync(join(summary.dirPath, "dom.html"))).toBe(true);
    expect(readFileSync(join(summary.dirPath, "dom.html"), "utf8")).toContain("Selected Work");

    expect(summary.palette).toContain("#111111");
    expect(summary.palette).toContain("#fafafa");
    expect(summary.fonts.map((f) => f.family)).toContain("Georgia");
    expect(summary.spacingScale).toContain(24);
    expect(summary.spacingScale).toContain(64);

    const capture = getCapture(db, summary.captureId)!;
    expect(capture.url).toBe(`${baseUrl}/`);
    const fadeUp = capture.motion.find((m) => m.kind === "keyframes" && m.name === "fade-up");
    expect(fadeUp).toBeDefined();
    expect(fadeUp!.keyframes).toBeDefined();
    const cardTransition = capture.motion.find(
      (m) => m.kind === "transition" && m.property === "transform",
    );
    expect(cardTransition).toMatchObject({ duration: "0.3s" });
  }, 90_000);

  it("rejects invalid URLs with INVALID_URL", async () => {
    await expect(crawlWebsite(config, db, "not-a-url")).rejects.toMatchObject({
      code: "INVALID_URL",
    });
    await expect(crawlWebsite(config, db, "ftp://example.com")).rejects.toMatchObject({
      code: "INVALID_URL",
    });
  });

  it("maps HTTP errors to structured failures", async () => {
    const err = await crawlWebsite(config, db, `${baseUrl}/missing-page`).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("CRAWL_FAILED");
  }, 60_000);
});
