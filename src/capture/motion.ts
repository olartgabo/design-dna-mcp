import { parse, walk, generate } from "css-tree";
import type { CssNode, Rule, Atrule } from "css-tree";
import type { MotionRule } from "../shared/types.js";

const TIME_RE = /^-?[\d.]+m?s$/;
const EASING_RE = /^(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|cubic-bezier\(.*\)|steps\(.*\)|linear\(.*\))$/;

/** Parse a `transition` / `animation` shorthand into duration/easing/delay parts. */
export function parseTimingShorthand(value: string): {
  duration?: string;
  easing?: string;
  delay?: string;
  name?: string;
} {
  const out: { duration?: string; easing?: string; delay?: string; name?: string } = {};
  // split on top-level spaces (keep function args together)
  const parts = value.match(/(?:[^\s()]+(?:\([^)]*\))?)+/g) ?? [];
  for (const part of parts) {
    if (TIME_RE.test(part)) {
      if (!out.duration) out.duration = part;
      else if (!out.delay) out.delay = part;
    } else if (EASING_RE.test(part)) {
      out.easing = part;
    } else if (!["none", "infinite", "normal", "reverse", "alternate", "alternate-reverse", "forwards", "backwards", "both", "running", "paused", "all"].includes(part)) {
      out.name = part;
    }
  }
  return out;
}

function keyframesFromAtrule(node: Atrule): MotionRule | null {
  const name = node.prelude ? generate(node.prelude) : undefined;
  if (!name || !node.block) return null;
  const steps: { offset: string; declarations: Record<string, string> }[] = [];
  node.block.children.forEach((child: CssNode) => {
    if (child.type !== "Rule") return;
    const offset = generate(child.prelude);
    const declarations: Record<string, string> = {};
    child.block.children.forEach((d: CssNode) => {
      if (d.type === "Declaration") declarations[d.property] = generate(d.value);
    });
    steps.push({ offset, declarations });
  });
  return { kind: "keyframes", name, keyframes: steps };
}

/**
 * Extract declared motion (keyframes, transition/animation rules) from raw CSS text.
 * Tolerant of parse errors — returns whatever it could read.
 */
export function parseCssMotion(cssText: string): MotionRule[] {
  const rules: MotionRule[] = [];
  let ast: CssNode;
  try {
    ast = parse(cssText, { parseValue: false, parseAtrulePrelude: false });
  } catch {
    return rules;
  }

  walk(ast, (node) => {
    if (node.type === "Atrule" && /^(-\w+-)?keyframes$/.test(node.name)) {
      const kf = keyframesFromAtrule(node);
      if (kf) rules.push(kf);
    }
    if (node.type === "Rule") {
      const rule = node as Rule;
      rule.block.children.forEach((d: CssNode) => {
        if (d.type !== "Declaration") return;
        const value = generate(d.value).trim();
        if (d.property === "transition" || d.property === "transition-property") {
          const timing = d.property === "transition" ? parseTimingShorthand(value) : {};
          rules.push({
            kind: "transition",
            property: d.property === "transition" ? timing.name ?? "all" : value,
            duration: timing.duration,
            easing: timing.easing,
            delay: timing.delay,
          });
        } else if (d.property === "animation" || d.property === "animation-name") {
          const timing = d.property === "animation" ? parseTimingShorthand(value) : { name: value };
          if (timing.name && timing.name !== "none") {
            rules.push({
              kind: "keyframes",
              name: timing.name,
              duration: timing.duration,
              easing: timing.easing,
              delay: timing.delay,
            });
          }
        }
      });
    }
  });
  return rules;
}

/**
 * Merge parsed stylesheet motion with per-element computed transitions, dedupe,
 * and attach usage counts. Keyframe *definitions* (with steps) absorb same-name
 * animation usages.
 */
export function consolidateMotion(
  cssRules: MotionRule[],
  elementTransitions: { transition: string; count: number }[],
): MotionRule[] {
  const out: MotionRule[] = [];
  const keyframeDefs = new Map<string, MotionRule>();

  for (const r of cssRules) {
    if (r.kind === "keyframes" && r.name) {
      const existing = keyframeDefs.get(r.name);
      if (!existing) keyframeDefs.set(r.name, { ...r });
      else Object.assign(existing, { ...r, ...existing }); // keep steps, gain timing
    }
  }
  out.push(...keyframeDefs.values());

  const transitionKey = (r: MotionRule) => `${r.property}|${r.duration}|${r.easing}|${r.delay}`;
  const transitions = new Map<string, MotionRule>();
  for (const r of cssRules) {
    if (r.kind !== "transition") continue;
    const key = transitionKey(r);
    if (!transitions.has(key)) transitions.set(key, { ...r });
  }
  for (const { transition, count } of elementTransitions) {
    const timing = parseTimingShorthand(transition);
    const rule: MotionRule = {
      kind: "transition",
      property: timing.name ?? "all",
      duration: timing.duration,
      easing: timing.easing,
      delay: timing.delay,
      usageCount: count,
    };
    const key = transitionKey(rule);
    const existing = transitions.get(key);
    if (existing) existing.usageCount = (existing.usageCount ?? 0) + count;
    else transitions.set(key, rule);
  }
  out.push(...transitions.values());
  return out;
}
