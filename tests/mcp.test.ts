import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import type { Server } from "node:http";
import { startFixtureServer } from "./helpers/fixture-server.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

let server: Server;
let baseUrl: string;
let dataDir: string;
let client: Client;

beforeAll(async () => {
  ({ server, baseUrl } = await startFixtureServer());
  dataDir = join(tmpdir(), `drm-mcp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs"), join(projectRoot, "src", "index.ts")],
      env: { ...process.env, DESIGN_RESEARCH_DATA_DIR: dataDir },
    }),
  );
}, 60_000);

afterAll(async () => {
  await client?.close();
  server?.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as { type: string; text?: string }[];
  return content[0]?.text ?? "";
}

describe("MCP server over stdio", () => {
  it("lists tools with schemas", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("ping");
    expect(names).toContain("crawl_website");
    const crawl = tools.find((t) => t.name === "crawl_website")!;
    expect(crawl.description).toMatch(/screenshot/i);
    expect(crawl.inputSchema.properties).toHaveProperty("url");
  });

  it("crawl_website returns a capture summary; re-crawl versions", async () => {
    const first = await client.callTool({
      name: "crawl_website",
      arguments: { url: `${baseUrl}/` },
    });
    expect(first.isError).toBeFalsy();
    const summary = JSON.parse(firstText(first));
    expect(summary.captureId).toBeTypeOf("number");
    expect(summary.palette).toContain("#111111");
    expect(summary.motionCount).toBeGreaterThan(0);

    const second = await client.callTool({
      name: "crawl_website",
      arguments: { url: `${baseUrl}/` },
    });
    expect(JSON.parse(firstText(second)).captureId).toBeGreaterThan(summary.captureId);
  }, 120_000);

  it("invalid URL returns a structured error, not a crash", async () => {
    const result = await client.callTool({
      name: "crawl_website",
      arguments: { url: "not-a-url" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(firstText(result)).error).toBe("INVALID_URL");
    // server still alive afterwards
    const ping = await client.callTool({ name: "ping", arguments: {} });
    expect(JSON.parse(firstText(ping)).status).toBe("ok");
  });
});
