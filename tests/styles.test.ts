import { describe, it, expect } from "vitest";
import {
  cssColorToHex,
  buildPalette,
  inferSpacingScale,
  buildFontInfos,
} from "../src/capture/styles.js";

describe("cssColorToHex", () => {
  it("converts rgb and rgba", () => {
    expect(cssColorToHex("rgb(255, 0, 0)")).toBe("#ff0000");
    expect(cssColorToHex("rgba(0, 0, 0, 0.8)")).toBe("#000000");
    expect(cssColorToHex("rgb(17 17 17)")).toBe("#111111");
  });
  it("drops transparent colors", () => {
    expect(cssColorToHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(cssColorToHex("rgba(255, 255, 255, 0.05)")).toBeNull();
  });
  it("passes through hex, rejects junk", () => {
    expect(cssColorToHex("#FAFAFA")).toBe("#fafafa");
    expect(cssColorToHex("transparent")).toBeNull();
  });
});

describe("buildPalette", () => {
  it("ranks by frequency and merges rgb/hex duplicates", () => {
    const palette = buildPalette([
      { color: "rgb(0, 0, 0)", count: 50 },
      { color: "#000000", count: 30 },
      { color: "rgb(255, 255, 255)", count: 60 },
      { color: "rgb(255, 62, 0)", count: 5 },
      { color: "rgba(1, 2, 3, 0)", count: 100 },
    ]);
    expect(palette).toEqual(["#000000", "#ffffff", "#ff3e00"]);
  });
});

describe("inferSpacingScale", () => {
  it("keeps recurring values, merges near-duplicates, sorts ascending", () => {
    const scale = inferSpacingScale([
      { value: 8, count: 40 },
      { value: 16, count: 35 },
      { value: 17, count: 3 }, // merges into 16
      { value: 24, count: 20 },
      { value: 64, count: 10 },
      { value: 13, count: 1 }, // below minCount → dropped
      { value: 500, count: 50 }, // out of range → dropped
    ]);
    expect(scale).toEqual([8, 16, 24, 64]);
  });
});

describe("buildFontInfos", () => {
  it("groups by first family, hierarchy sorted largest first", () => {
    const fonts = buildFontInfos([
      { family: '"Inter", sans-serif', size: 16, weight: 400, count: 100 },
      { family: "Inter, sans-serif", size: 64, weight: 700, count: 2 },
      { family: '"JetBrains Mono", monospace', size: 12, weight: 500, count: 30 },
    ]);
    expect(fonts.map((f) => f.family)).toEqual(["Inter", "JetBrains Mono"]);
    expect(fonts[0]!.usages[0]).toMatchObject({ size: 64, weight: 700 });
  });
});
