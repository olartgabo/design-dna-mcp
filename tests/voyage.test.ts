import { describe, it, expect, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { makeVoyageEmbedder } from "../src/embeddings/voyage.js";

const config = loadConfig({ VOYAGE_API_KEY: "vk-test" });

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("makeVoyageEmbedder", () => {
  it("throws MISSING_API_KEY without a key", () => {
    expect(() => makeVoyageEmbedder(loadConfig({}))).toThrowError(/VOYAGE_API_KEY/);
  });

  it("sends texts and returns vectors in input order", async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string);
      expect(body.model).toBe("voyage-3.5");
      expect(body.input_type).toBe("document");
      expect(body.output_dimension).toBe(1024);
      return jsonResponse(200, {
        data: [
          { index: 1, embedding: [0, 1] },
          { index: 0, embedding: [1, 0] },
        ],
      });
    });
    const embed = makeVoyageEmbedder(config, fetchFn as typeof fetch);
    const vecs = await embed(["a", "b"], "document");
    expect([...vecs[0]!]).toEqual([1, 0]);
    expect([...vecs[1]!]).toEqual([0, 1]);
  });

  it("retries 429 then succeeds", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls++;
      if (calls === 1) return jsonResponse(429, {});
      return jsonResponse(200, { data: [{ index: 0, embedding: [1] }] });
    });
    const embed = makeVoyageEmbedder(config, fetchFn as typeof fetch);
    const vecs = await embed(["a"], "query");
    expect(calls).toBe(2);
    expect(vecs).toHaveLength(1);
  }, 15_000);

  it("fails with EMBEDDING_FAILED on 400 without retrying", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(400, { error: "bad" }));
    const embed = makeVoyageEmbedder(config, fetchFn as typeof fetch);
    await expect(embed(["a"], "query")).rejects.toMatchObject({ code: "EMBEDDING_FAILED" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("returns [] for empty input without calling the API", async () => {
    const fetchFn = vi.fn();
    const embed = makeVoyageEmbedder(config, fetchFn as typeof fetch);
    expect(await embed([], "document")).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
