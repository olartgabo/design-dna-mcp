import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config.js";
import { missingApiKey } from "../shared/errors.js";

/** Minimal seam over the SDK so extraction logic is testable with a fake. */
export type MessageCreator = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;

export function makeMessageCreator(config: Config): MessageCreator {
  if (!config.anthropicApiKey) throw missingApiKey("ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  return (params) => client.messages.create(params);
}
