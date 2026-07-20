import type { DB } from "../db/database.js";
import { countComponents, getComponentsByIds, knnComponents } from "../db/repo.js";
import type { Embedder } from "../embeddings/voyage.js";
import type { SavedComponent } from "../shared/types.js";

export interface SearchFilters {
  category?: string;
  tag?: string;
  theme?: string;
  sourceUrl?: string;
}

export interface SearchHit extends SavedComponent {
  similarity: number;
}

function matches(c: SavedComponent, f: SearchFilters): boolean {
  if (f.category && c.category !== f.category) return false;
  if (f.tag && !c.tags.includes(f.tag)) return false;
  if (f.theme && c.metadata.theme !== f.theme) return false;
  if (f.sourceUrl && !c.sourceUrl.includes(f.sourceUrl)) return false;
  return true;
}

export async function findComponents(
  db: DB,
  embedder: Embedder,
  query: string,
  k = 10,
  filters: SearchFilters = {},
): Promise<{ hits: SearchHit[]; librarySize: number }> {
  const librarySize = countComponents(db);
  if (librarySize === 0) return { hits: [], librarySize: 0 };

  const [queryVec] = await embedder([query], "query");
  const neighbors = knnComponents(db, queryVec!, Math.min(k * 4, librarySize));
  const components = getComponentsByIds(db, neighbors.map((n) => n.componentId));

  const hits: SearchHit[] = [];
  for (const n of neighbors) {
    const c = components.get(n.componentId);
    if (!c || !matches(c, filters)) continue;
    hits.push({ ...c, similarity: Math.round((1 - n.distance) * 1000) / 1000 });
    if (hits.length >= k) break;
  }
  return { hits, librarySize };
}

export interface SiteGroup {
  sourceUrl: string;
  bestSimilarity: number;
  components: { id: number; name: string; category: string; similarity: number }[];
}

/** Same index, grouped by source website — the "sites like X" view. */
export async function searchDesigns(
  db: DB,
  embedder: Embedder,
  query: string,
  k = 10,
): Promise<{ sites: SiteGroup[]; librarySize: number }> {
  const { hits, librarySize } = await findComponents(db, embedder, query, k * 3);
  const groups = new Map<string, SiteGroup>();
  for (const hit of hits) {
    let group = groups.get(hit.sourceUrl);
    if (!group) {
      group = { sourceUrl: hit.sourceUrl, bestSimilarity: hit.similarity, components: [] };
      groups.set(hit.sourceUrl, group);
    }
    group.components.push({
      id: hit.id,
      name: hit.name,
      category: hit.category,
      similarity: hit.similarity,
    });
  }
  const sites = [...groups.values()]
    .sort((a, b) => b.bestSimilarity - a.bestSimilarity)
    .slice(0, k);
  return { sites, librarySize };
}
