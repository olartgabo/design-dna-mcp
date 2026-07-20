// Manual hardening harness: crawl real sites through the built pipeline.
// Usage: node scripts/try-crawl.mjs <url> [url...]
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, ensureDataDirs } from "../dist/config.js";
import { openDatabase } from "../dist/db/database.js";
import { crawlWebsite } from "../dist/capture/crawler.js";

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("usage: node scripts/try-crawl.mjs <url> [url...]");
  process.exit(1);
}

const dataDir = process.env.DESIGN_DNA_DATA_DIR ?? join(tmpdir(), `ddm-try-${Date.now()}`);
const config = loadConfig({ ...process.env, DESIGN_DNA_DATA_DIR: dataDir });
ensureDataDirs(config);
const db = openDatabase(config.dbPath, config.embeddingDims);

for (const url of urls) {
  const started = Date.now();
  try {
    const summary = await crawlWebsite(config, db, url);
    console.log(`OK ${url} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    console.log(
      JSON.stringify(
        {
          captureId: summary.captureId,
          title: summary.pageTitle,
          screenshots: summary.screenshotCount,
          palette: summary.palette,
          fonts: summary.fonts.map((f) => f.family),
          spacing: summary.spacingScale,
          motionCount: summary.motionCount,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error(`FAIL ${url}: ${err.code ?? ""} ${err.message}`);
  }
}
db.close();
console.log(`data dir: ${dataDir}`);
