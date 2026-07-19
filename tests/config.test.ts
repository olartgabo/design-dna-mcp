import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, rmSync } from "node:fs";
import { loadConfig, ensureDataDirs } from "../src/config.js";
import { AppError, missingApiKey, toToolError } from "../src/shared/errors.js";

describe("loadConfig", () => {
  it("respects DESIGN_RESEARCH_DATA_DIR override", () => {
    const config = loadConfig({ DESIGN_RESEARCH_DATA_DIR: "C:\\custom\\dir" });
    expect(config.dataDir).toBe("C:\\custom\\dir");
    expect(config.dbPath).toBe(join("C:\\custom\\dir", "db.sqlite"));
  });

  it("defaults to ~/.design-research-mcp and claude-sonnet-5", () => {
    const config = loadConfig({});
    expect(config.dataDir).toMatch(/\.design-research-mcp$/);
    expect(config.analysisModel).toBe("claude-sonnet-5");
    expect(config.embeddingModel).toBe("voyage-3.5");
    expect(config.anthropicApiKey).toBeUndefined();
  });

  it("ensureDataDirs creates capture/component dirs", () => {
    const dir = join(tmpdir(), `drm-test-${process.pid}-${Math.random().toString(36).slice(2)}`);
    try {
      const config = loadConfig({ DESIGN_RESEARCH_DATA_DIR: dir });
      ensureDataDirs(config);
      expect(existsSync(config.capturesDir)).toBe(true);
      expect(existsSync(config.componentsDir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("errors", () => {
  it("maps AppError to structured tool error", () => {
    const result = toToolError(new AppError("CRAWL_TIMEOUT", "took too long"));
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({
      error: "CRAWL_TIMEOUT",
      message: "took too long",
    });
  });

  it("maps unknown errors to INTERNAL", () => {
    const result = toToolError(new Error("boom"));
    expect(JSON.parse(result.content[0].text).error).toBe("INTERNAL");
  });

  it("missingApiKey names the variable", () => {
    const err = missingApiKey("VOYAGE_API_KEY");
    expect(err.code).toBe("MISSING_API_KEY");
    expect(err.message).toContain("VOYAGE_API_KEY");
  });
});
