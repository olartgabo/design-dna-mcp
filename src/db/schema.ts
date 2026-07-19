export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  title TEXT,
  first_crawled_at TEXT NOT NULL,
  last_crawled_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS captures (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id),
  url TEXT NOT NULL,
  page_title TEXT,
  viewport_w INTEGER NOT NULL,
  viewport_h INTEGER NOT NULL,
  dir_path TEXT NOT NULL,
  palette_json TEXT NOT NULL DEFAULT '[]',
  fonts_json TEXT NOT NULL DEFAULT '[]',
  spacing_json TEXT NOT NULL DEFAULT '[]',
  motion_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'complete',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_captures_url ON captures(url);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY,
  capture_id INTEGER NOT NULL REFERENCES captures(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  selector TEXT,
  bbox_json TEXT,
  crop_path TEXT,
  saved_component_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_candidates_capture ON candidates(capture_id);

CREATE TABLE IF NOT EXISTS components (
  id INTEGER PRIMARY KEY,
  capture_id INTEGER REFERENCES captures(id),
  source_url TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  selector TEXT,
  bbox_json TEXT,
  crop_path TEXT,
  css_snippet TEXT,
  dom_snippet TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_url, name)
);
CREATE INDEX IF NOT EXISTS idx_components_category ON components(category);
`;

export const VEC_SCHEMA_SQL = (dims: number) => `
CREATE VIRTUAL TABLE IF NOT EXISTS vec_components USING vec0(
  component_id INTEGER PRIMARY KEY,
  embedding float[${dims}]
);
`;

export const COMPONENT_CATEGORIES = [
  "navigation",
  "hero",
  "cards",
  "buttons",
  "typography",
  "footer",
  "form",
  "grid",
  "hover-effect",
  "loader",
  "cursor",
  "page-transition",
  "motion",
  "section-separator",
  "number-treatment",
  "annotation",
  "ascii",
  "diagram",
  "other",
] as const;

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];
