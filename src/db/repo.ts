import type { DB } from "./database.js";
import type {
  BBox,
  ComponentCandidate,
  ComponentMetadata,
  FontInfo,
  MotionRule,
  SavedComponent,
} from "../shared/types.js";
import type { ComponentCategory } from "./schema.js";

const now = () => new Date().toISOString();

// ---------- sites ----------

export function upsertSite(db: DB, url: string, domain: string, title: string | null): number {
  const ts = now();
  const row = db
    .prepare(
      `INSERT INTO sites (url, domain, title, first_crawled_at, last_crawled_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET title = excluded.title, last_crawled_at = excluded.last_crawled_at
       RETURNING id`,
    )
    .get(url, domain, title, ts, ts) as { id: number };
  return row.id;
}

// ---------- captures ----------

export interface CaptureRow {
  id: number;
  site_id: number;
  url: string;
  page_title: string | null;
  viewport_w: number;
  viewport_h: number;
  dir_path: string;
  palette: string[];
  fonts: FontInfo[];
  spacing: number[];
  motion: MotionRule[];
  status: string;
  created_at: string;
}

export function insertCapture(
  db: DB,
  data: {
    siteId: number;
    url: string;
    pageTitle: string | null;
    viewportW: number;
    viewportH: number;
    dirPath: string;
    palette: string[];
    fonts: FontInfo[];
    spacing: number[];
    motion: MotionRule[];
  },
): number {
  const row = db
    .prepare(
      `INSERT INTO captures
         (site_id, url, page_title, viewport_w, viewport_h, dir_path,
          palette_json, fonts_json, spacing_json, motion_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'complete', ?)
       RETURNING id`,
    )
    .get(
      data.siteId,
      data.url,
      data.pageTitle,
      data.viewportW,
      data.viewportH,
      data.dirPath,
      JSON.stringify(data.palette),
      JSON.stringify(data.fonts),
      JSON.stringify(data.spacing),
      JSON.stringify(data.motion),
      now(),
    ) as { id: number };
  return row.id;
}

function hydrateCapture(raw: Record<string, unknown> | undefined): CaptureRow | null {
  if (!raw) return null;
  return {
    ...(raw as Omit<CaptureRow, "palette" | "fonts" | "spacing" | "motion">),
    palette: JSON.parse(raw.palette_json as string),
    fonts: JSON.parse(raw.fonts_json as string),
    spacing: JSON.parse(raw.spacing_json as string),
    motion: JSON.parse(raw.motion_json as string),
  } as CaptureRow;
}

export function getCapture(db: DB, id: number): CaptureRow | null {
  return hydrateCapture(
    db.prepare(`SELECT * FROM captures WHERE id = ?`).get(id) as Record<string, unknown> | undefined,
  );
}

export function getLatestCaptureByUrl(db: DB, url: string): CaptureRow | null {
  return hydrateCapture(
    db
      .prepare(`SELECT * FROM captures WHERE url = ? ORDER BY id DESC LIMIT 1`)
      .get(url) as Record<string, unknown> | undefined,
  );
}

// ---------- candidates ----------

export interface CandidateRow extends ComponentCandidate {
  id: number;
  captureId: number;
  cropPath: string | null;
  savedComponentId: number | null;
}

export function insertCandidates(
  db: DB,
  captureId: number,
  candidates: (ComponentCandidate & { cropPath?: string | null })[],
): number[] {
  const stmt = db.prepare(
    `INSERT INTO candidates
       (capture_id, name, category, description, tags_json, metadata_json,
        selector, bbox_json, crop_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING id`,
  );
  const ids: number[] = [];
  const insertAll = db.transaction(() => {
    for (const c of candidates) {
      const row = stmt.get(
        captureId,
        c.name,
        c.category,
        c.description,
        JSON.stringify(c.tags),
        JSON.stringify(c.metadata),
        c.selector ?? null,
        c.bbox ? JSON.stringify(c.bbox) : null,
        c.cropPath ?? null,
        now(),
      ) as { id: number };
      ids.push(row.id);
    }
  });
  insertAll();
  return ids;
}

function hydrateCandidate(raw: Record<string, unknown> | undefined): CandidateRow | null {
  if (!raw) return null;
  return {
    id: raw.id as number,
    captureId: raw.capture_id as number,
    name: raw.name as string,
    category: raw.category as ComponentCategory,
    description: raw.description as string,
    tags: JSON.parse(raw.tags_json as string),
    metadata: JSON.parse(raw.metadata_json as string) as ComponentMetadata,
    selector: (raw.selector as string | null) ?? undefined,
    bbox: raw.bbox_json ? (JSON.parse(raw.bbox_json as string) as BBox) : undefined,
    cropPath: raw.crop_path as string | null,
    savedComponentId: raw.saved_component_id as number | null,
  };
}

export function getCandidate(db: DB, id: number): CandidateRow | null {
  return hydrateCandidate(
    db.prepare(`SELECT * FROM candidates WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined,
  );
}

export function listCandidates(db: DB, captureId: number): CandidateRow[] {
  const rows = db
    .prepare(`SELECT * FROM candidates WHERE capture_id = ? ORDER BY id`)
    .all(captureId) as Record<string, unknown>[];
  return rows.map((r) => hydrateCandidate(r)!) ;
}

export function markCandidateSaved(db: DB, candidateId: number, componentId: number): void {
  db.prepare(`UPDATE candidates SET saved_component_id = ? WHERE id = ?`).run(
    componentId,
    candidateId,
  );
}

// ---------- components ----------

export function upsertComponent(
  db: DB,
  data: {
    captureId: number | null;
    sourceUrl: string;
    name: string;
    category: ComponentCategory;
    description: string;
    tags: string[];
    metadata: ComponentMetadata;
    selector?: string | null;
    bbox?: BBox | null;
    cropPath?: string | null;
    cssSnippet?: string | null;
    domSnippet?: string | null;
  },
): { id: number; created: boolean } {
  const ts = now();
  const existing = db
    .prepare(`SELECT id FROM components WHERE source_url = ? AND name = ?`)
    .get(data.sourceUrl, data.name) as { id: number } | undefined;

  const row = db
    .prepare(
      `INSERT INTO components
         (capture_id, source_url, name, category, description, tags_json, metadata_json,
          selector, bbox_json, crop_path, css_snippet, dom_snippet, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_url, name) DO UPDATE SET
         capture_id = excluded.capture_id,
         category = excluded.category,
         description = excluded.description,
         tags_json = excluded.tags_json,
         metadata_json = excluded.metadata_json,
         selector = excluded.selector,
         bbox_json = excluded.bbox_json,
         crop_path = excluded.crop_path,
         css_snippet = excluded.css_snippet,
         dom_snippet = excluded.dom_snippet,
         updated_at = excluded.updated_at
       RETURNING id`,
    )
    .get(
      data.captureId,
      data.sourceUrl,
      data.name,
      data.category,
      data.description,
      JSON.stringify(data.tags),
      JSON.stringify(data.metadata),
      data.selector ?? null,
      data.bbox ? JSON.stringify(data.bbox) : null,
      data.cropPath ?? null,
      data.cssSnippet ?? null,
      data.domSnippet ?? null,
      ts,
      ts,
    ) as { id: number };
  return { id: row.id, created: !existing };
}

function hydrateComponent(raw: Record<string, unknown>): SavedComponent {
  return {
    id: raw.id as number,
    captureId: raw.capture_id as number | null,
    sourceUrl: raw.source_url as string,
    name: raw.name as string,
    category: raw.category as ComponentCategory,
    description: raw.description as string,
    tags: JSON.parse(raw.tags_json as string),
    metadata: JSON.parse(raw.metadata_json as string) as ComponentMetadata,
    selector: (raw.selector as string | null) ?? undefined,
    bbox: raw.bbox_json ? (JSON.parse(raw.bbox_json as string) as BBox) : undefined,
    cropPath: raw.crop_path as string | null,
    cssSnippet: raw.css_snippet as string | null,
    domSnippet: raw.dom_snippet as string | null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

export function getComponentsByIds(db: DB, ids: number[]): Map<number, SavedComponent> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT * FROM components WHERE id IN (${placeholders})`)
    .all(...ids) as Record<string, unknown>[];
  return new Map(rows.map((r) => [r.id as number, hydrateComponent(r)]));
}

export function countComponents(db: DB): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM components`).get() as { n: number };
  return row.n;
}

// ---------- vectors ----------

export function setComponentEmbedding(db: DB, componentId: number, embedding: Float32Array): void {
  db.prepare(`DELETE FROM vec_components WHERE component_id = ?`).run(BigInt(componentId));
  db.prepare(`INSERT INTO vec_components (component_id, embedding) VALUES (?, ?)`).run(
    BigInt(componentId),
    Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength),
  );
}

export function knnComponents(
  db: DB,
  query: Float32Array,
  k: number,
): { componentId: number; distance: number }[] {
  const rows = db
    .prepare(
      `SELECT component_id, distance FROM vec_components
       WHERE embedding MATCH ? AND k = ?
       ORDER BY distance`,
    )
    .all(Buffer.from(query.buffer, query.byteOffset, query.byteLength), BigInt(k)) as {
    component_id: number | bigint;
    distance: number;
  }[];
  return rows.map((r) => ({ componentId: Number(r.component_id), distance: r.distance }));
}
