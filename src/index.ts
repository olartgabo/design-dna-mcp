#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, ensureDataDirs } from "./config.js";
import { openDatabase } from "./db/database.js";
import { createServer } from "./server.js";
import { logger } from "./shared/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  ensureDataDirs(config);
  const db = openDatabase(config.dbPath, config.embeddingDims);
  const server = createServer({ config, db });
  await server.connect(new StdioServerTransport());
  logger.info(`ready (data dir: ${config.dataDir})`);
}

main().catch((err) => {
  logger.error("fatal:", err);
  process.exit(1);
});
