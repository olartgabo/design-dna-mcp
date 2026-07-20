import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { loadConfig, ensureDataDirs, type Config } from "../src/config.js";
import { openDatabase, type DB } from "../src/db/database.js";
import {
  upsertSite,
  insertCapture,
  insertCandidates,
  getCandidate,
  countComponents,
} from "../src/db/repo.js";
import type { Embedder } from "../src/embeddings/voyage.js";
import {
  saveByCandidateId,
  saveAllFromCapture,
  saveInline,
  embeddingText,
} from "../src/library/save.js";
import { findComponents, searchDesigns } from "../src/library/search.js";

const DIMS = 4;

let dir: string;
let db: DB;
let config: Config;

/**
 * Deterministic fake embedder: maps known keywords to unit axes so
 * similarity ordering is predictable.
 */
const AXES: Record<string, number> = { navigation: 0, hero: 1, footer: 2 };
const fakeEmbedder: Embedder = async (texts) =>
  texts.map((t) => {
    const vec = new Float32Array(DIMS);
    const lower = t.toLowerCase();
    for (const [word, axis] of Object.entries(AXES)) {
      if (lower.includes(word)) vec[axis] += 1;
    }
    if (vec.every((v) => v === 0)) vec[3] = 1;
    const norm = Math.hypot(...vec);
    return vec.map((v) => v / norm) as Float32Array;
  });

beforeEach(() => {
  dir = join(tmpdir(), `drm-lib-${process.pid}-${Math.random().toString(36).slice(2)}`);
  config = loadConfig({ DESIGN_RESEARCH_DATA_DIR: dir });
  ensureDataDirs(config);
  db = openDatabase(config.dbPath, DIMS);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function seedCapture(url: string): number {
  const siteId = upsertSite(db, url, new URL(url).hostname, "T");
  const capDir = join(dir, "captures", url.replace(/\W/g, "_"));
  mkdirSync(capDir, { recursive: true });
  writeFileSync(join(capDir, "full.png"), Buffer.from("89504e47", "hex"));
  return insertCapture(db, {
    siteId,
    url,
    pageTitle: "T",
    viewportW: 1440,
    viewportH: 900,
    dirPath: capDir,
    palette: [],
    fonts: [],
    spacing: [],
    motion: [],
  });
}

function seedCandidates(captureId: number) {
  return insertCandidates(db, captureId, [
    {
      name: "Sticky Navigation",
      category: "navigation",
      description: "Editorial sticky navigation bar",
      tags: ["editorial"],
      metadata: { theme: "dark" },
    },
    {
      name: "Fullscreen Hero",
      category: "hero",
      description: "Fullscreen hero with oversized type",
      tags: ["brutalist"],
      metadata: { theme: "light" },
    },
  ]);
}

describe("save", () => {
  it("saves a single candidate with embedding + crop copy and marks it saved", async () => {
    const capId = seedCapture("https://a.com");
    const [candidateId] = seedCandidates(capId);
    const results = await saveByCandidateId(config, db, fakeEmbedder, candidateId!);
    expect(results).toHaveLength(1);
    expect(results[0]!.created).toBe(true);
    expect(getCandidate(db, candidateId!)!.savedComponentId).toBe(results[0]!.componentId);
    expect(existsSync(join(config.componentsDir, String(results[0]!.componentId), "crop.png"))).toBe(true);
  });

  it("saveAll saves only unsaved candidates; re-save upserts", async () => {
    const capId = seedCapture("https://a.com");
    const [firstId] = seedCandidates(capId);
    await saveByCandidateId(config, db, fakeEmbedder, firstId!);
    const results = await saveAllFromCapture(config, db, fakeEmbedder, capId);
    expect(results).toHaveLength(1); // only the hero was unsaved
    expect(countComponents(db)).toBe(2);

    // saving the same candidate again updates, not duplicates
    const again = await saveByCandidateId(config, db, fakeEmbedder, firstId!);
    expect(again[0]!.created).toBe(false);
    expect(countComponents(db)).toBe(2);
  });

  it("saveInline persists a manual component", async () => {
    const results = await saveInline(config, db, fakeEmbedder, {
      name: "Terminal Footer",
      category: "footer",
      description: "Monospace footer",
      tags: ["terminal"],
      metadata: {},
      sourceUrl: "https://c.com",
    });
    expect(results[0]!.created).toBe(true);
    expect(countComponents(db)).toBe(1);
  });

  it("embeddingText includes name, category, tags, metadata", () => {
    const text = embeddingText({
      name: "Nav",
      category: "navigation",
      description: "Sticky",
      tags: ["swiss"],
      metadata: { theme: "dark", style: ["editorial"] },
    });
    expect(text).toContain("Nav");
    expect(text).toContain("category: navigation");
    expect(text).toContain("tags: swiss");
    expect(text).toContain("theme: dark");
    expect(text).toContain("style: editorial");
  });
});

describe("search", () => {
  async function seedLibrary() {
    const capA = seedCapture("https://a.com");
    const capB = seedCapture("https://b.com");
    seedCandidates(capA);
    await saveAllFromCapture(config, db, fakeEmbedder, capA);
    insertCandidates(db, capB, [
      {
        name: "Minimal Footer",
        category: "footer",
        description: "Sparse minimal footer",
        tags: ["minimal"],
        metadata: { theme: "light" },
      },
    ]);
    await saveAllFromCapture(config, db, fakeEmbedder, capB);
  }

  it("returns hits ranked by similarity", async () => {
    await seedLibrary();
    const { hits } = await findComponents(db, fakeEmbedder, "sticky navigation bar", 5);
    expect(hits[0]!.name).toBe("Sticky Navigation");
    expect(hits[0]!.similarity).toBeGreaterThan(hits.at(-1)!.similarity);
  });

  it("applies filters on top of vector search", async () => {
    await seedLibrary();
    const { hits } = await findComponents(db, fakeEmbedder, "navigation", 5, { theme: "light" });
    expect(hits.every((h) => h.metadata.theme === "light")).toBe(true);
    const { hits: byCat } = await findComponents(db, fakeEmbedder, "anything", 5, {
      category: "footer",
    });
    expect(byCat.map((h) => h.name)).toEqual(["Minimal Footer"]);
  });

  it("empty library returns empty results, not an error", async () => {
    const result = await findComponents(db, fakeEmbedder, "navigation", 5);
    expect(result).toEqual({ hits: [], librarySize: 0 });
  });

  it("search_designs groups by site", async () => {
    await seedLibrary();
    const { sites } = await searchDesigns(db, fakeEmbedder, "footer", 5);
    expect(sites.length).toBe(2);
    expect(sites[0]!.sourceUrl).toBe("https://b.com"); // footer lives on b.com
    expect(sites[0]!.components[0]!.name).toBe("Minimal Footer");
  });
});
