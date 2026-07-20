import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";

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

/**
 * The project was renamed from design-research-mcp to design-dna-mcp. DESIGN_DNA_*
 * is canonical; DESIGN_RESEARCH_* still resolves so existing installs keep working.
 */
function resolveDataDir(env: NodeJS.ProcessEnv): string {
  const override = env.DESIGN_DNA_DATA_DIR ?? env.DESIGN_RESEARCH_DATA_DIR;
  if (override) return override;

  // Adopt a pre-rename data dir in place rather than stranding an existing library.
  const legacy = join(homedir(), ".design-research-mcp");
  if (existsSync(legacy)) return legacy;

  return join(homedir(), ".design-dna-mcp");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = resolveDataDir(env);
  return {
    dataDir,
    dbPath: join(dataDir, "db.sqlite"),
    capturesDir: join(dataDir, "captures"),
    componentsDir: join(dataDir, "components"),
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    voyageApiKey: env.VOYAGE_API_KEY,
    analysisModel: env.DESIGN_DNA_MODEL ?? env.DESIGN_RESEARCH_MODEL ?? "claude-sonnet-5",
    embeddingModel:
      env.DESIGN_DNA_EMBEDDING_MODEL ?? env.DESIGN_RESEARCH_EMBEDDING_MODEL ?? "voyage-3.5",
    embeddingDims: 1024,
    viewport: { width: 1440, height: 900 },
    crawlTimeoutMs: 45_000,
  };
}

export function ensureDataDirs(config: Config): void {
  mkdirSync(config.capturesDir, { recursive: true });
  mkdirSync(config.componentsDir, { recursive: true });
}
