import type { Config } from "../config.js";
import { AppError, missingApiKey } from "../shared/errors.js";
import { logger } from "../shared/logger.js";

export type InputType = "document" | "query";

/** Injectable seam: embed texts → one vector per text, in order. */
export type Embedder = (texts: string[], inputType: InputType) => Promise<Float32Array[]>;

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MAX_RETRIES = 2;

export function makeVoyageEmbedder(
  config: Config,
  fetchFn: typeof fetch = fetch,
): Embedder {
  const apiKey = config.voyageApiKey;
  if (!apiKey) throw missingApiKey("VOYAGE_API_KEY");

  return async (texts, inputType) => {
    if (texts.length === 0) return [];
    let lastError = "";
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        logger.warn(`voyage retry ${attempt}: ${lastError}`);
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
