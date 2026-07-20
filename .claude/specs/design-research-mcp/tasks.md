# Design Research MCP — Tasks (v1 MVP)

Ordered, independently verifiable. Each cites the requirement it satisfies and how it's verified. Check off as completed.

## Phase 0 — Scaffold

- [x] **T1. Project scaffold** (US-5)
  Init npm project (`type: module`), TypeScript strict config, vitest, deps from design.md, `npx playwright install chromium`, `.gitignore`, `git init`.
  *Verify:* `npm run build` and `npm test` (empty suite) pass; chromium launches in a smoke script.

- [x] **T2. Config + logger + errors** (US-5)
  `config.ts` (env vars, data dir default `~/.design-research-mcp/`, dir creation), stderr-only `logger.ts`, typed `errors.ts` with the codes from design.md.
  *Verify:* unit tests — data dir override via `DESIGN_RESEARCH_DATA_DIR`, error → MCP result mapping.

- [x] **T3. Database layer** (US-1..4)
  `schema.sql`, `database.ts` (better-sqlite3 + sqlite-vec extension load, idempotent migration), `repo.ts` typed CRUD for sites/captures/candidates/components + vec insert/KNN query.
  *Verify:* unit tests — schema creates on fresh file; component upsert on (source_url, name); vec KNN returns nearest of 3 seeded vectors. Runs on win32/Node 24.

- [x] **T4. Minimal MCP server boots** (US-5)
  `index.ts` + `server.ts` with a stub `ping` tool over stdio.
  *Verify:* `npx mcpjam` inspector connects, lists the tool, calls it.

## Phase 1 — Capture (US-1)

- [x] **T5. Crawler core**
  `crawler.ts`: launch, realistic context, goto + settle, auto-scroll, DOM snapshot saved to capture dir; capture row written with status.
  *Verify:* integration test against local fixture HTML site (offline, deterministic).

- [x] **T6. Style extraction**
  `styles.ts` in-page collection: computed-style sample, fonts + hierarchy, color-frequency palette, spacing histogram → inferred scale.
  *Verify:* unit tests for palette/spacing/hierarchy inference on synthetic style data; fixture-site integration asserts expected fonts/colors.

- [x] **T7. Motion extraction**
  `motion.ts`: CSSOM keyframes/transitions walk + css-tree fallback for cross-origin sheets; stored in `motion_json`.
  *Verify:* unit tests on CSS fixtures (keyframes, shorthand transitions); fixture site includes an animation that must be detected.

- [x] **T8. Screenshots + `crawl_website` tool**
  `screenshots.ts` (full page + ≤8 viewport slices), wire everything into the `crawl_website` MCP tool returning the compact summary; re-crawl creates a new capture version; structured errors for bad/unreachable URLs.
  *Verify:* mcpjam call against fixture site returns captureId + summary; second call yields a new captureId; invalid URL returns `INVALID_URL` not a crash.

## Phase 2 — Analysis (US-2)

- [x] **T9. Distiller**
  `distill.ts`: capture → compact JSON (structure outline, typography, palette, spacing, motion) with hard size caps; image pick + downscale (≤6).
  *Verify:* unit test asserts payload stays under cap on a large synthetic capture.

- [x] **T10. Claude extraction**
  `anthropic.ts` + `prompts.ts` + `extract.ts`: one-shot vision call, forced tool-use schema → candidates persisted to `candidates` table; retries/backoff; `MISSING_API_KEY` / `ANALYSIS_FAILED` paths.
  *Verify:* unit test with mocked Anthropic client (schema parsing, persistence); one manual live run on a real site (requires key) sanity-checked by hand.

- [x] **T11. `extract_components` tool**
  Auto-crawl when URL has no capture; `focus` hint; element crops via selector/bbox when provided, slice fallback.
  *Verify:* mcpjam call on fixture site (mock or live key) returns candidates with categories from the enum; uncrawled URL triggers crawl first.

## Phase 3 — Library (US-3, US-4)

- [x] **T12. Voyage embeddings client**
  `voyage.ts`: batch embed, retries, `MISSING_API_KEY` path.
  *Verify:* unit test with mocked HTTP; one live call sanity check (dims = 1024).

- [x] **T13. `save_component` tool**
  By candidateId, inline fields, and `saveAll`; embedding computed at save; upsert semantics; crop + snippets persisted.
  *Verify:* unit tests (mocked embeddings) for all three input modes + upsert; mcpjam call saves a fixture candidate.

- [x] **T14. `find_components` tool**
  Query embedding → KNN (over-fetch ×4) → filters (category/tag/theme/sourceUrl) → ranked results with scores + crop paths; empty-library friendly message.
  *Verify:* unit test with seeded embeddings asserts ordering + filter behavior; mcpjam call returns expected component first.

- [x] **T15. `search_designs` tool**
  Same index grouped by site, per-site best matches.
  *Verify:* unit test with components from 2 sites asserts grouping; mcpjam call.

## Phase 4 — Hardening & ship

- [ ] **T16. End-to-end pass on real sites** (all US)
  Run crawl→extract→save→find on 2–3 real inspiration sites (live keys); fix breakage found (lazy-load, huge pages, blocked resources).
  *Verify:* documented transcript of the loop succeeding; `find_components("sticky navigation")`-style query returns a sensible hit.

- [ ] **T17. mcpjam evals + docs** (US-5)
  mcpjam evals config for the loop against the fixture site; `README.md` (setup, env vars, Claude Code/Desktop registration snippet, cost notes).
  *Verify:* evals run green (key-requiring steps marked); a fresh `claude mcp add` registration lists and calls tools.

- [ ] **T18. Requirements sweep**
  Walk every EARS criterion in requirements.md against the implementation; note gaps or ship.
  *Verify:* checklist appended to this file with pass/fail per criterion.
