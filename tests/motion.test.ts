import { describe, it, expect } from "vitest";
import {
  parseCssMotion,
  parseTimingShorthand,
  consolidateMotion,
} from "../src/capture/motion.js";

describe("parseTimingShorthand", () => {
  it("extracts duration, easing, delay, name", () => {
    expect(parseTimingShorthand("opacity 0.3s ease-in-out 0.1s")).toEqual({
      name: "opacity",
      duration: "0.3s",
      easing: "ease-in-out",
      delay: "0.1s",
    });
  });
  it("handles cubic-bezier", () => {
    const t = parseTimingShorthand("transform 400ms cubic-bezier(0.16, 1, 0.3, 1)");
    expect(t.easing).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(t.duration).toBe("400ms");
  });
});

describe("parseCssMotion", () => {
  const css = `
    @keyframes fade-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .card { transition: transform 0.3s ease; }
    .hero-title { animation: fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) both; }
  `;

  it("extracts keyframes with steps", () => {
    const rules = parseCssMotion(css);
    const kf = rules.find((r) => r.kind === "keyframes" && r.keyframes);
    expect(kf!.name).toBe("fade-up");
    expect(kf!.keyframes).toHaveLength(2);
    expect(kf!.keyframes![0]!.declarations.opacity).toBe("0");
  });

  it("extracts transitions and animation usages", () => {
    const rules = parseCssMotion(css);
    const tr = rules.find((r) => r.kind === "transition");
    expect(tr).toMatchObject({ property: "transform", duration: "0.3s", easing: "ease" });
    const anim = rules.find((r) => r.kind === "keyframes" && !r.keyframes);
    expect(anim).toMatchObject({ name: "fade-up", duration: "0.8s" });
  });

  it("survives broken CSS", () => {
    expect(parseCssMotion("this is }{ not css @")).toEqual([]);
  });
});

describe("consolidateMotion", () => {
  it("merges keyframe defs with usages and dedupes transitions", () => {
    const merged = consolidateMotion(
      parseCssMotion(`
        @keyframes spin { to { transform: rotate(360deg); } }
        .a { transition: opacity 0.2s ease; }
        .b { transition: opacity 0.2s ease; }
        .loader { animation: spin 1s linear; }
      `),
      [{ transition: "opacity 0.2s ease", count: 12 }],
    );
    const keyframes = merged.filter((r) => r.kind === "keyframes");
    expect(keyframes).toHaveLength(1);
    expect(keyframes[0]).toMatchObject({ name: "spin", duration: "1s" });
    expect(keyframes[0]!.keyframes).toBeDefined();

    const transitions = merged.filter((r) => r.kind === "transition");
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.usageCount).toBe(12);
  });
});
