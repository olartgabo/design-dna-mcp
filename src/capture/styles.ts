import type { FontInfo } from "../shared/types.js";

/** Raw data collected inside the page context (see collector in crawler.ts). */
export interface RawPageData {
  title: string;
  docHeight: number;
  fontUsage: { family: string; size: number; weight: number; count: number }[];
  colorUsage: { color: string; count: number }[];
  spacingUsage: { value: number; count: number }[];
  elementTransitions: { transition: string; count: number }[];
  outline: { tag: string; text: string; depth: number }[];
}

/** rgb()/rgba() → #rrggbb, or null for transparent/invalid colors. */
export function cssColorToHex(color: string): string | null {
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
  if (!m) {
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
    return null;
  }
  const alphaRaw = m[4];
  if (alphaRaw !== undefined) {
    const alpha = alphaRaw.endsWith("%") ? parseFloat(alphaRaw) / 100 : parseFloat(alphaRaw);
    if (alpha < 0.1) return null;
  }
  const toHex = (v: string) => Math.min(255, parseInt(v, 10)).toString(16).padStart(2, "0");
  return `#${toHex(m[1]!)}${toHex(m[2]!)}${toHex(m[3]!)}`;
}

/** Top-N palette by usage frequency, transparent and invalid colors dropped. */
export function buildPalette(
  colorUsage: { color: string; count: number }[],
  topN = 8,
): string[] {
  const counts = new Map<string, number>();
  for (const { color, count } of colorUsage) {
    const hex = cssColorToHex(color);
    if (!hex) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + count);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([hex]) => hex);
}

/**
 * Infer the spacing scale from a margin/padding/gap histogram: keep values that
 * recur, merge near-duplicates (±1px), sort ascending.
 */
export function inferSpacingScale(
  spacingUsage: { value: number; count: number }[],
  { minCount = 3, maxValues = 10 } = {},
): number[] {
  const candidates = spacingUsage
    .filter(({ value, count }) => value >= 2 && value <= 256 && count >= minCount)
    .sort((a, b) => b.count - a.count);

  const kept: { value: number; count: number }[] = [];
  for (const c of candidates) {
    const near = kept.find((k) => Math.abs(k.value - c.value) <= 1);
    if (near) near.count += c.count;
    else kept.push({ ...c });
  }
  return kept
    .sort((a, b) => b.count - a.count)
    .slice(0, maxValues)
    .map((k) => k.value)
    .sort((a, b) => a - b);
}

/** Group font usage by family; usages sorted largest-size-first (the hierarchy). */
export function buildFontInfos(
  fontUsage: { family: string; size: number; weight: number; count: number }[],
  { maxFamilies = 6, maxUsages = 8 } = {},
): FontInfo[] {
  const families = new Map<string, Map<string, { size: number; weight: number; count: number }>>();
  for (const u of fontUsage) {
    const family = u.family.split(",")[0]!.trim().replace(/^["']|["']$/g, "");
    if (!family) continue;
    let usages = families.get(family);
    if (!usages) families.set(family, (usages = new Map()));
    const key = `${u.size}:${u.weight}`;
    const existing = usages.get(key);
    if (existing) existing.count += u.count;
    else usages.set(key, { size: u.size, weight: u.weight, count: u.count });
  }
  return [...families.entries()]
    .map(([family, usages]) => ({
      family,
      total: [...usages.values()].reduce((s, u) => s + u.count, 0),
      usages: [...usages.values()]
        .sort((a, b) => b.size - a.size || b.weight - a.weight)
        .slice(0, maxUsages),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, maxFamilies)
    .map(({ family, usages }) => ({ family, usages }));
}
