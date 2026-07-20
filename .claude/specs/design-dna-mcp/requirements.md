# Design Research MCP — Requirements (v1 MVP)

## Goal

Build an MCP server that, given a website URL, captures its design (screenshots, DOM, styles), uses Claude to decompose it into reusable design components with metadata, stores them locally with embeddings, and makes them searchable by natural language — so the unit of knowledge is the component, not the website.

## Decisions already made (with the user, 2026-07-19)

| Area | Decision |
|---|---|
| Runtime | TypeScript MCP SDK, stdio transport, Node 24, Windows dev machine |
| MVP tools | `crawl_website`, `extract_components`, `save_component`, `find_components` (+ `search_designs` as alias/variant) |
| Deferred to v2 | `classify_design`, `compare_designs`, `recommend_components`, gallery scrapers, interaction recording |
| AI analysis | Server-side Claude API calls (`ANTHROPIC_API_KEY`) |
| Embeddings | Voyage AI `voyage-3.5` (`VOYAGE_API_KEY`) |
| Storage | SQLite + sqlite-vec; screenshots/assets as local files |
| Ingestion | Manual URLs only, user-curated |
| Capture depth | Static screenshots + DOM + computed styles + fonts + colors + spacing scale + parsed CSS transitions/keyframes. No interaction recording. |
| Crawler | Playwright |
| Testing | mcpjam CLI (npx, v3.15.1) for inspection/evals + unit tests |

## User stories

### US-1: Crawl a website
As a designer, I want to point the MCP at a URL and have it capture everything needed for design analysis, so that the raw evidence is stored once and analysis can happen on top of it.

Acceptance criteria:
- WHEN `crawl_website(url)` is called with a valid URL THE SYSTEM SHALL load the page in Playwright, capture a full-page screenshot, per-viewport-section screenshots, a DOM snapshot, computed styles for visible elements, the font families in use, the color palette, and the detected spacing values, and persist them as a "capture" on disk + SQLite.
- WHEN the page declares CSS transitions/animations/keyframes THE SYSTEM SHALL extract and store them (property, duration, easing, delay, keyframe steps) as part of the capture.
- WHEN the same URL is crawled again THE SYSTEM SHALL create a new capture version rather than overwrite the previous one.
- WHEN the URL is unreachable, times out, or blocks automation THE SYSTEM SHALL return a structured error (not crash the server) with a human-readable reason.
- WHEN the crawl succeeds THE SYSTEM SHALL return a capture id and a summary (page title, screenshot count, palette, fonts) small enough to fit comfortably in an MCP tool result.

### US-2: Extract components
As a designer, I want the system to decompose a captured website into reusable components with metadata, so that I save design decisions instead of whole sites.

Acceptance criteria:
- WHEN `extract_components(url_or_capture_id)` is called for an existing capture THE SYSTEM SHALL send screenshots + distilled DOM/style data to Claude and return a list of component candidates, each with: name, category (navigation, hero, cards, buttons, typography, footer, grid, hover-effect, motion, number-treatment, etc.), description, style tags, and metadata (complexity, interaction, layout, theme, motion, spacing) per the CONTEXT.md metadata schema.
- WHEN the URL has not been crawled yet THE SYSTEM SHALL crawl it first, then extract.
- WHEN extraction runs THE SYSTEM SHALL associate each component with the evidence region (bounding box / element selector and the screenshot crop it came from) when Claude can identify it.
- WHEN the Claude API call fails THE SYSTEM SHALL return a structured error and leave the capture intact for retry.
- Extraction results are *candidates* — they are not persisted to the component library until saved (US-3), but the candidate list SHALL be cached so `save_component` can reference candidates by id without re-running analysis.

### US-3: Save components
As a designer, I want to save chosen components into my library, so that the database stays curated rather than a dump of everything.

Acceptance criteria:
- WHEN `save_component(candidate_id)` is called THE SYSTEM SHALL persist the component (name, category, description, metadata, tags, source URL, screenshot crop, DOM/CSS snippet when available) to SQLite and files.
- WHEN `save_component` is called with inline data (no candidate id) THE SYSTEM SHALL accept a manually-described component with the same schema.
- WHEN a component is saved THE SYSTEM SHALL compute a Voyage embedding of its searchable text (name + description + tags + metadata) and store it in sqlite-vec.
- WHEN saving a component whose (source URL + name) already exists THE SYSTEM SHALL update it instead of duplicating.
- Optionally, `extract_components` may support a `save_all: true` flag to bulk-save every candidate in one call.

### US-4: Search the library
As a designer, I want to search my library in natural language, so that I can find "sticky editorial navigation" or "large page numbers" instantly.

Acceptance criteria:
- WHEN `find_components(query)` is called THE SYSTEM SHALL embed the query with Voyage and return the top-K components by vector similarity, each with name, category, tags, description, source URL, similarity score, and the path/reference to its screenshot crop.
- WHEN filters are provided (category, style tag, theme, source URL) THE SYSTEM SHALL apply them in addition to the semantic search.
- WHEN the library is empty THE SYSTEM SHALL return an empty result with a helpful message, not an error.
- WHEN `search_designs(query)` is called THE SYSTEM SHALL return results grouped by source website (site-level view of the same index) so the user can also discover "sites like X".

### US-5: Operate as a well-behaved MCP server
As an MCP client user (Claude Code / Claude Desktop), I want the server to install and run with minimal setup, so that it's usable day-to-day.

Acceptance criteria:
- WHEN the server starts THE SYSTEM SHALL run over stdio, create its data directory and SQLite schema if missing, and never write logs to stdout (stderr only) so the MCP protocol stream stays clean.
- WHEN `ANTHROPIC_API_KEY` or `VOYAGE_API_KEY` is missing THE SYSTEM SHALL still start; tools that need the missing key SHALL fail with a clear per-call error naming the missing variable.
- WHEN inspected with mcpjam CLI THE SYSTEM SHALL list all tools with complete input schemas and descriptions good enough for an LLM to call them correctly.
- Tool results SHALL be structured (JSON content) and keep large payloads (full DOM, all computed styles) on disk, returning references/paths instead of inlining them.

## Non-goals (v1)

- No `classify_design`, `compare_designs`, `recommend_components` (v2).
- No gallery scraping (Godly, Awwwards, etc.) — manual URLs only.
- No interaction/motion recording (hover, scroll capture) — only declared CSS motion.
- No web frontend (React/Next.js UI is future work).
- No PostgreSQL/pgvector/S3 — but the storage layer should not make a later migration gratuitously hard.
- No multi-user/hosting concerns; single local user.
- No cloning or code generation from captured sites — this is research, not replication.

## Constraints

- Windows dev machine: paths, Playwright browser install, and sqlite-vec native binding must work on win32/Node 24.
- Respect robots/ToS pragmatically: single-page fetches of user-chosen URLs, sensible timeouts, an honest-but-normal browser context; no crawling at scale.
- Claude API cost per crawl+extract should stay bounded (target: a handful of vision calls per site, not per-element calls).
- Screenshots can be large; store as files, never as SQLite blobs or base64 in tool results (thumbnail/crop paths only).

## Open questions (answered defaults — flag if wrong)

- Data directory: default `~/.design-research-mcp/` (overridable via `DESIGN_RESEARCH_DATA_DIR` env var).
- Claude model for analysis: default `claude-sonnet-5` (good vision, cheaper than Fable/Opus; overridable via env).
- Top-K default for search: 10.
