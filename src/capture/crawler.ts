import { chromium, type Page, errors as playwrightErrors } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.js";
import type { DB } from "../db/database.js";
import { upsertSite, insertCapture } from "../db/repo.js";
import { AppError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import type { CaptureSummary } from "../shared/types.js";
import {
  buildFontInfos,
  buildPalette,
  inferSpacingScale,
  type RawPageData,
} from "./styles.js";
import { consolidateMotion, parseCssMotion } from "./motion.js";
import { captureScreenshots } from "./screenshots.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface CssCollection {
  inlineCss: string[];
  blockedHrefs: string[];
}

function validateUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("INVALID_URL", `Not a valid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("INVALID_URL", `Only http(s) URLs are supported, got: ${url.protocol}`);
  }
  return url;
}

/** Runs inside the browser. Must stay self-contained (no imports). */
function collectPageData(maxElements: number): RawPageData & { css: CssCollection } {
  const fontCounts = new Map<string, number>();
  const colorCounts = new Map<string, number>();
  const spacingCounts = new Map<number, number>();
  const transitionCounts = new Map<string, number>();

  const elements = document.querySelectorAll("body, body *");
  let visited = 0;
  for (const el of elements) {
    if (visited >= maxElements) break;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    visited++;
    const cs = getComputedStyle(el);

    const fontKey = `${cs.fontFamily}|${Math.round(parseFloat(cs.fontSize))}|${cs.fontWeight}`;
    fontCounts.set(fontKey, (fontCounts.get(fontKey) ?? 0) + 1);

    for (const c of [cs.color, cs.backgroundColor, cs.borderTopColor]) {
      colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1);
    }

    for (const v of [
      cs.marginTop, cs.marginBottom, cs.paddingTop, cs.paddingBottom,
      cs.paddingLeft, cs.paddingRight, cs.rowGap, cs.columnGap,
    ]) {
      const px = Math.round(parseFloat(v));
      if (Number.isFinite(px) && px > 0) {
        spacingCounts.set(px, (spacingCounts.get(px) ?? 0) + 1);
      }
    }

    if (cs.transitionDuration !== "0s" && cs.transitionProperty !== "none") {
      const t = `${cs.transitionProperty} ${cs.transitionDuration} ${cs.transitionTimingFunction} ${cs.transitionDelay}`;
      transitionCounts.set(t, (transitionCounts.get(t) ?? 0) + 1);
    }
  }

  const outline: { tag: string; text: string; depth: number }[] = [];
  for (const el of document.querySelectorAll(
    "h1, h2, h3, h4, nav, header, footer, main, section, article, aside",
  )) {
    if (outline.length >= 120) break;
    let depth = 0;
    for (let p = el.parentElement; p; p = p.parentElement) depth++;
    const text = (el instanceof HTMLHeadingElement ? el.textContent ?? "" : "")
      .trim()
      .slice(0, 80);
    outline.push({ tag: el.tagName.toLowerCase(), text, depth });
  }

  const inlineCss: string[] = [];
  const blockedHrefs: string[] = [];
  for (const sheet of document.styleSheets) {
    try {
      const rules = sheet.cssRules;
      let text = "";
      for (const rule of rules) text += rule.cssText + "\n";
      inlineCss.push(text);
    } catch {
      if (sheet.href) blockedHrefs.push(sheet.href);
    }
  }

  return {
    title: document.title,
    docHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    fontUsage: [...fontCounts.entries()].map(([key, count]) => {
      const [family, size, weight] = key.split("|");
      return { family: family!, size: Number(size), weight: Number(weight) || 400, count };
    }),
    colorUsage: [...colorCounts.entries()].map(([color, count]) => ({ color, count })),
    spacingUsage: [...spacingCounts.entries()].map(([value, count]) => ({ value, count })),
    elementTransitions: [...transitionCounts.entries()].map(([transition, count]) => ({
      transition,
      count,
    })),
    outline,
    css: { inlineCss, blockedHrefs },
  };
}

async function autoScroll(page: Page, viewportHeight: number): Promise<void> {
  await page.evaluate(async (vh) => {
    const maxSteps = 20;
    const height = () =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let i = 1; i <= maxSteps && i * vh < height(); i++) {
      window.scrollTo(0, i * vh);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
  }, viewportHeight);
}

export async function crawlWebsite(
  config: Config,
  db: DB,
  rawUrl: string,
): Promise<CaptureSummary> {
  const url = validateUrl(rawUrl);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: config.viewport,
      userAgent: USER_AGENT,
    });
    const page = await context.newPage();
    // esbuild-based runners (tsx) inject __name() calls into functions serialized
    // for page.evaluate; define it in the page so the collector runs everywhere.
    await page.addInitScript("globalThis.__name = (fn) => fn;");

    let response;
    try {
      response = await page.goto(url.href, {
        waitUntil: "domcontentloaded",
        timeout: config.crawlTimeoutMs,
      });
    } catch (err) {
      if (err instanceof playwrightErrors.TimeoutError) {
        throw new AppError("CRAWL_TIMEOUT", `Page did not load within ${config.crawlTimeoutMs}ms: ${url.href}`);
      }
      throw new AppError("CRAWL_FAILED", `Navigation failed for ${url.href}: ${(err as Error).message}`);
    }
    const status = response?.status() ?? 0;
    if (status === 403 || status === 429) {
      throw new AppError("CRAWL_BLOCKED", `Site returned HTTP ${status} — likely blocking automated access: ${url.href}`);
    }
    if (status >= 400) {
      throw new AppError("CRAWL_FAILED", `Site returned HTTP ${status}: ${url.href}`);
    }

    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    await autoScroll(page, config.viewport.height);

    const data = await page.evaluate(collectPageData, 1500);

    // fetch stylesheets the CSSOM refused to expose (cross-origin)
    const fetchedCss: string[] = [];
    for (const href of data.css.blockedHrefs.slice(0, 20)) {
      try {
        const res = await context.request.get(href, { timeout: 10_000 });
        if (res.ok()) fetchedCss.push(await res.text());
      } catch {
        logger.warn(`could not fetch stylesheet ${href}`);
      }
    }

    const allCss = [...data.css.inlineCss, ...fetchedCss];
    const motion = consolidateMotion(
      allCss.flatMap((css) => parseCssMotion(css)),
      data.elementTransitions,
    );
    const palette = buildPalette(data.colorUsage);
    const spacing = inferSpacingScale(data.spacingUsage);
    const fonts = buildFontInfos(data.fontUsage);

    const dirName = `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const dirPath = join(config.capturesDir, dirName);
    mkdirSync(join(dirPath, "css"), { recursive: true });

    const dom = await page.content();
    writeFileSync(join(dirPath, "dom.html"), dom, "utf8");
    const { css: _css, ...rawWithoutCss } = data;
    writeFileSync(join(dirPath, "styles.json"), JSON.stringify(rawWithoutCss, null, 2), "utf8");
    allCss.forEach((css, i) => {
      writeFileSync(join(dirPath, "css", `sheet-${String(i).padStart(2, "0")}.css`), css, "utf8");
    });

    const screenshotCount = await captureScreenshots(page, dirPath, {
      docHeight: data.docHeight,
      viewport: config.viewport,
    });

    const siteId = upsertSite(db, url.href, url.hostname, data.title || null);
    const captureId = insertCapture(db, {
      siteId,
      url: url.href,
      pageTitle: data.title || null,
      viewportW: config.viewport.width,
      viewportH: config.viewport.height,
      dirPath,
      palette,
      fonts,
      spacing,
      motion,
    });

    return {
      captureId,
      url: url.href,
      pageTitle: data.title || null,
      screenshotCount,
      palette,
      fonts,
      spacingScale: spacing,
      motionCount: motion.length,
      dirPath,
    };
  } finally {
    await browser.close();
  }
}
