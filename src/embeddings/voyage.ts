import type { Config } from "../config.js";
import { AppError, missingApiKey } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

export type InputType = "document" | "query";

/** Injectable seam: embed texts → one vector per text, in order. */
export type Embedder = (texts: string[], inputType: InputType) => Promise<Float32Array[]>;

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MAX_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 60_000;

export function makeVoyageEmbedder(
  config: Config,
  fetchFn: typeof fetch = fetch,
): Embedder {
  const apiKey = config.voyageApiKey;
  if (!apiKey) throw missingApiKey("VOYAGE_API_KEY");

  return async (texts, inputType) => {
    if (texts.length === 0) return [];
    let lastError = "";
    // free-tier Voyage allows only a few requests/minute, so waits must be long
    let nextDelayMs = 2_500;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        logger.warn(`voyage retry ${attempt} in ${nextDelayMs}ms: ${lastError}`);
        await new Promise((r) => setTimeout(r, nextDelayMs));
      }
      let res: Response;
      try {
        res = await fetchFn(VOYAGE_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            input: texts,
            model: config.embeddingModel,
            input_type: inputType,
            output_dimension: config.embeddingDims,
          }),
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = `HTTP ${res.status}`;
        // Voyage's free tier (3 RPM) sends no retry-after — waits must span the minute window
        const retryAfter = Number(res.headers.get("retry-after"));
        nextDelayMs = Math.min(
          retryAfter > 0 ? retryAfter * 1000 : 10_000 * 2 ** attempt,
          MAX_RETRY_DELAY_MS,
        );
        continue;
      }
      if (!res.ok) {
        throw new AppError("EMBEDDING_FAILED", `Voyage API error HTTP ${res.status}: ${await res.text()}`);
      }
      const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
      return body.data
        .sort((a, b) => a.index - b.index)
        .map((d) => Float32Array.from(d.embedding));
    }
    throw new AppError("EMBEDDING_FAILED", `Voyage API failed after retries: ${lastError}`);
  };
}
