import { join } from "node:path";
import type { Page } from "playwright";

const MAX_SLICES = 8;

/**
 * Full-page shot plus up to MAX_SLICES viewport-height slices.
 * Returns the number of files written.
 */
export async function captureScreenshots(
  page: Page,
  dirPath: string,
  opts: { docHeight: number; viewport: { width: number; height: number } },
): Promise<number> {
  await page.screenshot({ path: join(dirPath, "full.png"), fullPage: true });
  let count = 1;

  const sliceCount = Math.min(MAX_SLICES, Math.ceil(opts.docHeight / opts.viewport.height));
  for (let i = 0; i < sliceCount; i++) {
    const y = i * opts.viewport.height;
    const height = Math.min(opts.viewport.height, opts.docHeight - y);
    if (height < 50) break;
    await page.screenshot({
      path: join(dirPath, `section-${String(i + 1).padStart(2, "0")}.png`),
      fullPage: true,
      clip: { x: 0, y, width: opts.viewport.width, height },
    });
    count++;
  }
  return count;
}
