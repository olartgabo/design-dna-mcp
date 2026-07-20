import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CaptureRow } from "../db/repo.js";
import type { RawPageData } from "../capture/styles.js";
import type { MotionRule } from "../shared/types.js";

const MAX_PAYLOAD_CHARS = 9_000;
const MAX_OUTLINE = 60;
const MAX_MOTION = 20;
const MAX_IMAGES = 6;
/** Anthropic rejects images taller than 8000px — very long pages ship as slices only. */
const MAX_IMAGE_DIM = 7_900;

export interface DistilledCapture {
  payload: {
    url: string;
    title: string | null;
    outline: string[];
    typography: { family: string; hierarchy: string[] }[];
    palette: string[];
    spacingScale: number[];
    motion: MotionRule[];
    viewport: { width: number; height: number };
    pageHeight: number | null;
  };
  images: { path: string; label: string }[];
}

function trimMotion(motion: MotionRule[]): MotionRule[] {
  return motion.slice(0, MAX_MOTION).map((m) => ({
    ...m,
    keyframes: m.keyframes?.slice(0, 6),
  }));
}

/** Reduce a capture to a compact, size-capped payload + a small set of images. */
export function distillCapture(capture: CaptureRow): DistilledCapture {
  let raw: Pick<RawPageData, "outline" | "docHeight"> | null = null;
  const stylesPath = join(capture.dir_path, "styles.json");
  if (existsSync(stylesPath)) {
    try {
      raw = JSON.parse(readFileSync(stylesPath, "utf8"));
    } catch {
      raw = null;
    }
  }

  const outline = (raw?.outline ?? [])
    .slice(0, MAX_OUTLINE)
    .map((o) => `${"  ".repeat(Math.min(o.depth, 8))}<${o.tag}>${o.text ? ` ${o.text}` : ""}`);

  const typography = capture.fonts.map((f) => ({
    family: f.family,
    hierarchy: f.usages.map((u) => `${u.size}px/${u.weight} (×${u.count})`),
  }));

  const payload: DistilledCapture["payload"] = {
    url: capture.url,
    title: capture.page_title,
    outline,
    typography,
    palette: capture.palette,
    spacingScale: capture.spacing,
    motion: trimMotion(capture.motion),
    viewport: { width: capture.viewport_w, height: capture.viewport_h },
    pageHeight: raw?.docHeight ?? null,
  };

  // hard cap: shrink the most voluminous fields until the payload fits
  while (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) {
    if (payload.motion.length > 5) payload.motion = payload.motion.slice(0, payload.motion.length - 5);
    else if (payload.outline.length > 20) payload.outline = payload.outline.slice(0, payload.outline.length - 10);
    else if (payload.typography.length > 3) payload.typography = payload.typography.slice(0, 3);
    else break;
  }

  const images: { path: string; label: string }[] = [];
  const fullPath = join(capture.dir_path, "full.png");
  const pageHeight = raw?.docHeight ?? 0;
  if (existsSync(fullPath) && pageHeight > 0 && pageHeight <= MAX_IMAGE_DIM) {
    images.push({ path: fullPath, label: "full page" });
  }
  for (let i = 1; images.length < MAX_IMAGES; i++) {
    const slicePath = join(capture.dir_path, `section-${String(i).padStart(2, "0")}.png`);
    if (!existsSync(slicePath)) break;
    images.push({ path: slicePath, label: `section ${i} (y=${(i - 1) * capture.viewport_h}px)` });
  }

  return { payload, images };
}
