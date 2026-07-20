import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "node:path";
import { tmpdir } from "node:os";

const projectDir = "C:/Users/PCNET/Desktop/Github/DesignResearchMCP";
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(projectDir, "dist", "index.js")],
  env: {
    ...process.env,
    DESIGN_DNA_DATA_DIR: join(tmpdir(), `ddm-smoke-${Date.now()}`),
  },
});

const client = new Client({ name: "smoke", version: "0.0.1" });
await client.connect(transport);
const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
const result = await client.callTool({ name: "ping", arguments: {} });
console.log("ping:", result.content[0].text);
await client.close();
