import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, rmSync } from "node:fs";
import { openDatabase, type DB } from "../src/db/database.js";
import {
  upsertSite,
  insertCapture,
  getCapture,
  getLatestCaptureByUrl,
  insertCandidates,
  getCandidate,
  upsertComponent,
  getComponentsByIds,
  setComponentEmbedding,
  knnComponents,
  countComponents,
} from "../src/db/repo.js";

const DIMS = 4; // small dims keep the test readable; prod uses 1024

let dir: string;
let db: DB;

beforeEach(() => {
  dir = join(tmpdir(), `drm-db-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  db = openDatabase(join(dir, "db.sqlite"), DIMS);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function makeCapture(url = "https://example.com"): number {
  const siteId = upsertSite(db, url, "example.com", "Example");
  return insertCapture(db, {
    siteId,
    url,
    pageTitle: "Example",
    viewportW: 1440,
    viewportH: 900,
    dirPath: join(dir, "captures", "1"),
    palette: ["#000000", "#ffffff"],
    fonts: [{ family: "Inter", usages: [{ size: 16, weight: 400, count: 10 }] }],
    spacing: [8, 16, 24],
    motion: [{ kind: "transition", property: "opacity", duration: "0.3s" }],
  });
}

describe("captures", () => {
  it("creates schema on a fresh file and round-trips a capture", () => {
    const id = makeCapture();
    const cap = getCapture(db, id)!;
    expect(cap.url).toBe("https://example.com");
    expect(cap.palette).toEqual(["#000000", "#ffffff"]);
    expect(cap.fonts[0]!.family).toBe("Inter");
    expect(cap.motion[0]!.kind).toBe("transition");
  });

  it("re-crawl creates a new version; latest wins", () => {
    const first = makeCapture();
    const second = makeCapture();
    expect(second).not.toBe(first);
    expect(getLatestCaptureByUrl(db, "https://example.com")!.id).toBe(second);
  });
});

describe("candidates", () => {
  it("inserts and hydrates candidates", () => {
    const capId = makeCapture();
    const [id] = insertCandidates(db, capId, [
      {
        name: "Editorial Navigation",
        category: "navigation",
        description: "Sticky top nav with hover underline",
        tags: ["editorial", "swiss"],
        metadata: { style: ["editorial"], complexity: "low", theme: "dark" },
        selector: "nav.main",
        bbox: { x: 0, y: 0, width: 1440, height: 80 },
      },
    ]);
    const c = getCandidate(db, id!)!;
    expect(c.category).toBe("navigation");
    expect(c.metadata.theme).toBe("dark");
    expect(c.bbox!.height).toBe(80);
    expect(c.savedComponentId).toBeNull();
  });
});

describe("components", () => {
  it("upserts on (source_url, name) instead of duplicating", () => {
    const base = {
      captureId: null,
      sourceUrl: "https://example.com",
      name: "Editorial Navigation",
      category: "navigation" as const,
      description: "v1",
      tags: ["editorial"],
      metadata: {},
    };
    const first = upsertComponent(db, base);
    const second = upsertComponent(db, { ...base, description: "v2" });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(countComponents(db)).toBe(1);
    expect(getComponentsByIds(db, [first.id]).get(first.id)!.description).toBe("v2");
  });
});

describe("vector search", () => {
  it("KNN returns nearest of seeded vectors", () => {
    const ids = [
      ["nav", [1, 0, 0, 0]],
      ["hero", [0, 1, 0, 0]],
      ["footer", [0, 0, 1, 0]],
    ].map(([name, vec]) => {
      const { id } = upsertComponent(db, {
        captureId: null,
        sourceUrl: "https://example.com",
        name: name as string,
        category: "other",
        description: name as string,
        tags: [],
        metadata: {},
      });
      setComponentEmbedding(db, id, new Float32Array(vec as number[]));
      return id;
    });

    const results = knnComponents(db, new Float32Array([0.9, 0.1, 0, 0]), 2);
    expect(results).toHaveLength(2);
    expect(results[0]!.componentId).toBe(ids[0]);
  });

  it("re-embedding replaces the old vector", () => {
    const { id } = upsertComponent(db, {
      captureId: null,
      sourceUrl: "https://example.com",
      name: "x",
      category: "other",
      description: "x",
      tags: [],
      metadata: {},
    });
    setComponentEmbedding(db, id, new Float32Array([1, 0, 0, 0]));
    setComponentEmbedding(db, id, new Float32Array([0, 0, 0, 1]));
    const results = knnComponents(db, new Float32Array([0, 0, 0, 1]), 1);
    expect(results[0]!.componentId).toBe(id);
    expect(results[0]!.distance).toBeLessThan(0.001);
  });
});
