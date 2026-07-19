import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export interface Config {
  dataDir: string;
  dbPath: string;
  capturesDir: string;
  componentsDir: string;
  anthropicApiKey: string | undefined;
  voyageApiKey: string | undefined;
  analysisModel: string;
  embeddingModel: string;
  embeddingDims: number;
  viewport: { width: number; height: number };
  crawlTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir =
    env.DESIGN_RESEARCH_DATA_DIR ?? join(homedir(), ".design-research-mcp");
  return {
    dataDir,
    dbPath: join(dataDir, "db.sqlite"),
    capturesDir: join(dataDir, "captures"),
    componentsDir: join(dataDir, "components"),
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    voyageApiKey: env.VOYAGE_API_KEY,
    analysisModel: env.DESIGN_RESEARCH_MODEL ?? "claude-sonnet-5",
    embeddingModel: env.DESIGN_RESEARCH_EMBEDDING_MODEL ?? "voyage-3.5",
    embeddingDims: 1024,
    viewport: { width: 1440, height: 900 },
    crawlTimeoutMs: 45_000,
  };
}

export function ensureDataDirs(config: Config): void {
  mkdirSync(config.capturesDir, { recursive: true });
  mkdirSync(config.componentsDir, { recursive: true });
}
