import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

/** Serve tests/fixtures/ over http on an ephemeral port. */
export async function startFixtureServer(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    const file = req.url === "/" || !req.url ? "site.html" : req.url.slice(1);
    try {
      const body = readFileSync(join(fixturesDir, file));
      res.writeHead(200, {
        "content-type": file.endsWith(".css") ? "text/css" : "text/html",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}
