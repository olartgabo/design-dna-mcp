# design-dna-mcp

**Extract the design DNA of any website — a searchable library of reusable UI patterns, built for Claude.**

Design galleries (Godly, Awwwards, Minimal Gallery…) are great sources of ideas but poor databases. You bookmark a site because you liked *one* thing about it — a navigation treatment, a spacing system, a hover animation — and then you can never find it again.

This MCP server fixes that. Point it at any website and it:

1. **Captures** the design evidence with Playwright — screenshots, DOM, computed styles, font hierarchy, color palette, spacing scale, and declared CSS motion
2. **Decomposes** it with Claude into reusable design components ("Numbered section index (x.x labels)", "Image reveal hover", "Pill-shaped primary CTA") with category, description, style tags, and metadata
3. **Stores** the components you choose to keep in a local SQLite library with vector embeddings
4. **Answers** natural-language queries from any MCP client: *"find sticky editorial navigation"*, *"monospace technical labels"*, *"sites like a technical product page"*

> The unit of knowledge is the **component**, not the website. A website is only evidence.

## Example

```
> crawl_website("https://linear.app")
  capture 1 · 9 screenshots · palette #f7f8f8/#0f1011/… · Inter Variable + Berkeley Mono · 167 motion rules

> extract_components(captureId: 1)
  [navigation]        Dark minimal top navigation            — minimal, dark, swiss, saas
  [typography]        Monospace inline code tag              — monospace, technical, terminal
  [diagram]           Numbered technical figure diagrams     — technical, blueprint, isometric
  [number-treatment]  Numbered section index (x.x labels)    — technical, monospace, editorial
  [motion]            Animated grid-dot background pattern   — technical, ambient, blueprint
  … 18 candidates

> save_component(captureId: 1, saveAll: true)

> find_components("monospace technical labels")
  0.62  [typography]        Monospace inline code tag           https://linear.app/
  0.61  [number-treatment]  Numbered section index (x.x labels) https://linear.app/
```

## Tools

| Tool | What it does |
|---|---|
| `crawl_website(url)` | Playwright capture: full-page + section screenshots, DOM, styles, fonts, palette, spacing scale, CSS motion. Versioned per crawl. No API cost. |
| `extract_components(url \| captureId, focus?)` | One Claude vision call decomposes a capture into component candidates. Candidates are cached, **not** auto-saved — you curate. |
| `save_component(candidateId \| captureId+saveAll \| component)` | Persists components to the library with a Voyage embedding. Upserts on (sourceUrl, name). |
| `find_components(query, filters?)` | Semantic search with optional category/tag/theme/sourceUrl filters. |
| `search_designs(query)` | Same index grouped by source website — the "sites like this" view. |
| `ping` | Health check + library size. |

## Setup

Requires **Node 20+** and API keys for [Anthropic](https://console.anthropic.com) (analysis) and [Voyage AI](https://dash.voyageai.com) (embeddings).

```sh
git clone https://github.com/olartgabo/design-dna-mcp.git
cd design-dna-mcp
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

### Register in Claude Code

The most reliable way on any platform (use `-s user` to enable it in all your projects):

```sh
claude mcp add-json design-dna -s user '{"command":"node","args":["/absolute/path/to/design-dna-mcp/dist/index.js"],"env":{"ANTHROPIC_API_KEY":"sk-ant-...","VOYAGE_API_KEY":"pa-..."}}'
```

### Register in Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "design-dna": {
      "command": "node",
      "args": ["/absolute/path/to/design-dna-mcp/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "VOYAGE_API_KEY": "pa-..."
      }
    }
  }
}
```

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | for `extract_components` | — | Claude vision analysis |
| `VOYAGE_API_KEY` | for save/search | — | Embeddings |
| `DESIGN_RESEARCH_DATA_DIR` | no | `~/.design-research-mcp` | SQLite DB + screenshots |
| `DESIGN_RESEARCH_MODEL` | no | `claude-sonnet-5` | Analysis model |
| `DESIGN_RESEARCH_EMBEDDING_MODEL` | no | `voyage-3.5` | Embedding model |

The server starts fine without keys — tools that need a missing key fail per-call with a clear error naming the variable. The library is shared across all your projects (it lives in the data dir, not the repo).

## How it works

```
website ─→ Playwright ─→ capture (screenshots · DOM · styles.json · css/)
                              │
                              ▼
                    distiller (size-capped JSON + ≤6 images)
                              │
                              ▼
                 Claude (one vision call, forced tool-use schema)
                              │
                              ▼
                    candidates (cached, human-curated)
                              │  save_component
                              ▼
              SQLite + sqlite-vec (cosine) + Voyage embeddings
                              │
                              ▼
                find_components / search_designs (MCP)
```

Design decisions worth knowing:

- **Bounded AI cost** — extraction is *one* Claude call per site (distilled data + a handful of images), never per-element calls.
- **Curation over hoarding** — extraction produces candidates; only what you save becomes searchable. `saveAll` exists when you want everything.
- **Everything local** — SQLite + sqlite-vec in a single file, screenshots on disk. No Postgres, no S3, no services.
- **Large payloads stay on disk** — tool results carry paths and compact summaries, never base64 blobs.

## Cost & rate limits

- `crawl_website` is free (local Playwright).
- `extract_components` ≈ one `claude-sonnet-5` call with ~5–10K input tokens + up to 6 images per site.
- Embeddings are tiny Voyage calls per save/search — effectively negligible.
- Voyage's **free tier allows ~3 requests/minute**; the client retries with long backoff (up to ~70s), so rapid-fire searches feel slow until you add billing to the Voyage account.

## Verifying with mcpjam

```sh
npx @mcpjam/cli tools list --transport stdio --command node --args dist/index.js
npx @mcpjam/cli server doctor --transport stdio --command node --args dist/index.js
npx @mcpjam/cli tools call --transport stdio --command node --args dist/index.js \
  --tool-name crawl_website --tool-args '{"url": "https://example.com"}'
```

## Development

```sh
npm test          # 49 offline tests (vitest) — local fixture site, no API keys needed
npm run dev       # run from source via tsx
node scripts/try-crawl.mjs https://linear.app   # crawl real sites (no keys needed)
node scripts/e2e.mjs https://linear.app         # full live loop (needs both keys)
node scripts/mcp-smoke.mjs                      # stdio round-trip smoke test
```

The full spec (requirements → design → tasks, with the verification sweep) lives in [`.claude/specs/design-research-mcp/`](.claude/specs/design-research-mcp/). The original product vision is in [`CONTEXT.md`](CONTEXT.md).

## Roadmap (v2)

- `classify_design(url)` — style confidence scores (editorial 92%, swiss 85%, …)
- `compare_designs(url1, url2)` — shared vs unique patterns
- `recommend_components(project_description)` — "I'm building a dark editorial portfolio" → curated component sets
- Interaction recording — hover/scroll capture with measured easing, duration, stagger
- FTS5 hybrid search, gallery-site ingestion helpers

## License

[MIT](LICENSE)
