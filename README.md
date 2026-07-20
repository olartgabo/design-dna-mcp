# Design Research MCP

An MCP server that turns design inspiration into a searchable knowledge base. Point it at a website and it captures the design evidence (screenshots, DOM, computed styles, fonts, palette, spacing, CSS motion), uses Claude to decompose it into **reusable design components**, and stores the ones you keep in a local library you can search in natural language.

> The unit of knowledge is the component, not the website. A website is only evidence.

## Tools

| Tool | What it does |
|---|---|
| `crawl_website(url)` | Playwright capture: full-page + section screenshots, DOM, styles, fonts, palette, spacing scale, declared CSS motion. Versioned per crawl. |
| `extract_components(url \| captureId, focus?)` | One Claude vision call decomposes the capture into component candidates (name, category, description, tags, metadata). Candidates are cached, not auto-saved. |
| `save_component(candidateId \| captureId+saveAll \| component)` | Curates candidates into the library. Computes a Voyage embedding at save time; upserts on (sourceUrl, name). |
| `find_components(query, filters?)` | Semantic search: "sticky editorial navigation", "large page numbers"… with category/tag/theme/sourceUrl filters. |
| `search_designs(query)` | Same index grouped by source website — the "sites like this" view. |
| `ping` | Health check + library size. |

## Setup

Requires Node 20+ (developed on Node 24, Windows).

```sh
npm install
npx playwright install chromium   # one-time browser download
npm run build
```

If npm blocks install scripts, approve the native builds once:

```sh
npm install-scripts approve better-sqlite3
npm install-scripts approve esbuild
npm rebuild better-sqlite3 esbuild
```

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | for `extract_components` | — | Claude vision analysis |
| `VOYAGE_API_KEY` | for save/search | — | Embeddings (voyage-3.5) |
| `DESIGN_RESEARCH_DATA_DIR` | no | `~/.design-research-mcp` | SQLite DB + screenshots |
| `DESIGN_RESEARCH_MODEL` | no | `claude-sonnet-5` | Analysis model |
| `DESIGN_RESEARCH_EMBEDDING_MODEL` | no | `voyage-3.5` | Embedding model |

The server starts fine without keys — tools that need a missing key fail per-call with a clear error naming the variable.

### Register in Claude Code

```sh
claude mcp add design-research \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e VOYAGE_API_KEY=pa-... \
  -- node /absolute/path/to/DesignResearchMCP/dist/index.js
```

### Register in Claude Desktop

```json
{
  "mcpServers": {
    "design-research": {
      "command": "node",
      "args": ["C:/absolute/path/to/DesignResearchMCP/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "VOYAGE_API_KEY": "pa-..."
      }
    }
  }
}
```

## Typical workflow

```
crawl_website("https://linear.app")
  → captureId 1, palette, fonts (Inter Variable, Berkeley Mono), 167 motion rules

extract_components(captureId: 1)
  → 8–20 candidates: "Sticky product navigation", "Monospace label system", …

save_component(candidateId: 3)          # curate the good ones
save_component(captureId: 1, saveAll: true)   # or keep everything

find_components("monospace technical labels", theme: "dark")
search_designs("editorial portfolio")
```

## Verifying with mcpjam

```sh
npm run build

# tool listing + schemas
npx @mcpjam/cli tools list --transport stdio --command node --args dist/index.js

# call a tool
npx @mcpjam/cli tools call --transport stdio --command node --args dist/index.js \
  --tool-name crawl_website --tool-args '{"url": "https://example.com"}'

# diagnostic sweep
npx @mcpjam/cli server doctor --transport stdio --command node --args dist/index.js
```

## Cost notes

- `crawl_website` is free (local Playwright).
- `extract_components` makes **one** Claude call with up to 6 images + a distilled JSON payload — roughly 5–10K input tokens plus image tokens per site on `claude-sonnet-5`.
- Embeddings are one small Voyage call per save / per search query — effectively negligible.
- Voyage's **free tier is rate-limited to ~3 requests/minute**; the client retries with long backoff (up to ~70s total), so rapid-fire searches may feel slow until you add payment info to the Voyage account (paid tiers are far higher).

## Development

```sh
npm test          # 49 offline tests (vitest) — fixture site, no API keys needed
npm run dev       # run from source via tsx
node scripts/try-crawl.mjs https://linear.app   # crawl real sites into a temp dir
node scripts/mcp-smoke.mjs                       # stdio round-trip smoke test
```

Specs live in `.claude/specs/design-research-mcp/` (requirements, design, tasks).
