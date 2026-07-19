import type { ComponentCategory } from "../db/schema.js";

/** Metadata schema from CONTEXT.md — every component gets this. */
export interface ComponentMetadata {
  style?: string[];
  complexity?: "low" | "medium" | "high";
  interaction?: string;
  layout?: string;
  theme?: string;
  motion?: string;
  spacing?: string;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FontInfo {
  family: string;
  /** distinct (size, weight) pairs seen, largest first — the typographic hierarchy */
  usages: { size: number; weight: number; count: number }[];
}

export interface MotionRule {
  kind: "keyframes" | "transition";
  name?: string;
  property?: string;
  duration?: string;
  easing?: string;
  delay?: string;
  keyframes?: { offset: string; declarations: Record<string, string> }[];
  /** rough count of elements using it, when known */
  usageCount?: number;
}

export interface CaptureSummary {
  captureId: number;
  url: string;
  pageTitle: string | null;
  screenshotCount: number;
  palette: string[];
  fonts: FontInfo[];
  spacingScale: number[];
  motionCount: number;
  dirPath: string;
}

export interface ComponentCandidate {
  name: string;
  category: ComponentCategory;
  description: string;
  tags: string[];
  metadata: ComponentMetadata;
  selector?: string;
  bbox?: BBox;
}

export interface SavedComponent extends ComponentCandidate {
  id: number;
  sourceUrl: string;
  captureId: number | null;
  cropPath: string | null;
  cssSnippet: string | null;
  domSnippet: string | null;
  createdAt: string;
  updatedAt: string;
}
