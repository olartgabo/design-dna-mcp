// Live end-to-end pass (T16): crawl → extract → save all → search.
// Requires ANTHROPIC_API_KEY and VOYAGE_API_KEY in the environment.
// Usage: node scripts/e2e.mjs <url> [url...]
import { loadConfig, ensureDataDirs } from "../dist/config.js";
import { openDatabase } from "../dist/db/database.js";
import { crawlWebsite } from "../dist/capture/crawler.js";
import { getCapture } from "../dist/db/repo.js";
import { makeMessageCreator } from "../dist/analysis/anthropic.js";
import { extractComponents } from "../dist/analysis/extract.js";
import { makeVoyageEmbedder } from "../dist/embeddings/voyage.js";
import { saveAllFromCapture } from "../dist/library/save.js";
import { findComponents, searchDesigns } from "../dist/library/search.js";

// with no URLs, skips ingestion and only queries the existing library
const urls = process.argv.slice(2);

const config = loadConfig();
ensureDataDirs(config);
const db = openDatabase(config.dbPath, config.embeddingDims);
const createMessage = urls.length > 0 ? makeMessageCreator(config) : null;
const embedder = makeVoyageEmbedder(config);

for (const url of urls) {
  console.log(`\n=== ${url} ===`);
  const summary = await crawlWebsite(config, db, url);
  console.log(`crawled: capture ${summary.captureId}, ${summary.screenshotCount} shots, ${summary.motionCount} motion rules`);
  const capture = getCapture(db, summary.captureId);
  const candidates = await extractComponents(config, db, capture, createMessage);
  console.log(`extracted ${candidates.length} candidates:`);
  for (const c of candidates) console.log(`  [${c.category}] ${c.name} — tags: ${c.tags.join(", ")}`);
  const saved = await saveAllFromCapture(config, db, embedder, summary.captureId);
  console.log(`saved ${saved.length} components`);
}

for (const query of ["sticky navigation", "monospace technical labels", "hero with oversized typography"]) {
  const { hits } = await findComponents(db, embedder, query, 3);
  console.log(`\nfind_components("${query}"):`);
  for (const h of hits) console.log(`  ${h.similarity}  [${h.category}] ${h.name}  (${h.sourceUrl})`);
}

const { sites } = await searchDesigns(db, embedder, "technical product design", 5);
console.log(`\nsearch_designs("technical product design"):`);
for (const s of sites) console.log(`  ${s.bestSimilarity}  ${s.sourceUrl} — ${s.components.map((c) => c.name).slice(0, 3).join("; ")}`);

db.close();
console.log(`\nlibrary: ${config.dbPath}`);
