import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.js";
import type { DB } from "../db/database.js";
import {
  getCandidate,
  getCapture,
  listCandidates,
  markCandidateSaved,
  upsertComponent,
  setComponentEmbedding,
  type CandidateRow,
  type CaptureRow,
} from "../db/repo.js";
import type { Embedder } from "../embeddings/voyage.js";
import { AppError } from "../shared/errors.js";
import type { ComponentCandidate } from "../shared/types.js";
import { assignCropPath } from "../tools/extract-components.js";

/** The text that gets embedded — name, category, description, tags, metadata. */
export function embeddingText(c: ComponentCandidate & { sourceUrl?: string }): string {
  const meta = Object.entries(c.metadata)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("; ");
  return [c.name, `category: ${c.category}`, c.description, `tags: ${c.tags.join(", ")}`, meta]
    .filter(Boolean)
    .join("\n");
}

export interface SaveResult {
  componentId: number;
  name: string;
  created: boolean;
}

async function persist(
  config: Config,
  db: DB,
  embedder: Embedder,
  items: { candidate: ComponentCandidate; sourceUrl: string; captureId: number | null; cropSource: string | null; candidateRowId?: number }[],
): Promise<SaveResult[]> {
  const vectors = await embedder(
    items.map((i) => embeddingText(i.candidate)),
    "document",
  );

  return items.map((item, idx) => {
    const { candidate, sourceUrl, captureId, cropSource, candidateRowId } = item;
    const { id, created } = upsertComponent(db, {
      captureId,
      sourceUrl,
      name: candidate.name,
      category: candidate.category,
      description: candidate.description,
      tags: candidate.tags,
      metadata: candidate.metadata,
      selector: candidate.selector ?? null,
      bbox: candidate.bbox ?? null,
      cropPath: null,
    });

    // copy evidence image next to the component so it survives capture cleanup
    let cropPath: string | null = null;
    if (cropSource && existsSync(cropSource)) {
      const dir = join(config.componentsDir, String(id));
      mkdirSync(dir, { recursive: true });
      cropPath = join(dir, "crop.png");
      copyFileSync(cropSource, cropPath);
      db.prepare(`UPDATE components SET crop_path = ? WHERE id = ?`).run(cropPath, id);
    }

    setComponentEmbedding(db, id, vectors[idx]!);
    if (candidateRowId != null) markCandidateSaved(db, candidateRowId, id);
    return { componentId: id, name: candidate.name, created };
  });
}

export async function saveByCandidateId(
  config: Config,
  db: DB,
  embedder: Embedder,
  candidateId: number,
): Promise<SaveResult[]> {
  const candidate = getCandidate(db, candidateId);
  if (!candidate) throw new AppError("CANDIDATE_NOT_FOUND", `No candidate with id ${candidateId}`);
  const capture = getCapture(db, candidate.captureId);
  return persistFromCandidates(config, db, embedder, capture, [candidate]);
}

export async function saveAllFromCapture(
  config: Config,
  db: DB,
  embedder: Embedder,
  captureId: number,
): Promise<SaveResult[]> {
  const capture = getCapture(db, captureId);
  if (!capture) throw new AppError("CAPTURE_NOT_FOUND", `No capture with id ${captureId}`);
  const candidates = listCandidates(db, captureId).filter((c) => c.savedComponentId == null);
  return persistFromCandidates(config, db, embedder, capture, candidates);
}

function persistFromCandidates(
  config: Config,
  db: DB,
  embedder: Embedder,
  capture: CaptureRow | null,
  candidates: CandidateRow[],
): Promise<SaveResult[]> {
  return persist(
    config,
    db,
    embedder,
    candidates.map((c) => ({
      candidate: c,
      sourceUrl: capture?.url ?? "unknown",
      captureId: capture?.id ?? null,
      cropSource: capture ? assignCropPath(capture, c) : null,
      candidateRowId: c.id,
    })),
  );
}

export async function saveInline(
  config: Config,
  db: DB,
  embedder: Embedder,
  component: ComponentCandidate & { sourceUrl: string },
): Promise<SaveResult[]> {
  return persist(config, db, embedder, [
    { candidate: component, sourceUrl: component.sourceUrl, captureId: null, cropSource: null },
  ]);
}
