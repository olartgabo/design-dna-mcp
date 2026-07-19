export type ErrorCode =
  | "INVALID_URL"
  | "CRAWL_TIMEOUT"
  | "CRAWL_BLOCKED"
  | "CRAWL_FAILED"
  | "CAPTURE_NOT_FOUND"
  | "CANDIDATE_NOT_FOUND"
  | "COMPONENT_NOT_FOUND"
  | "MISSING_API_KEY"
  | "ANALYSIS_FAILED"
  | "EMBEDDING_FAILED"
  | "INVALID_INPUT";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function missingApiKey(name: "ANTHROPIC_API_KEY" | "VOYAGE_API_KEY"): AppError {
  return new AppError(
    "MISSING_API_KEY",
    `${name} is not set. Add it to the MCP server's environment to use this tool.`,
  );
}

export interface ToolErrorResult {
  isError: true;
  content: [{ type: "text"; text: string }];
  [key: string]: unknown;
}

/** Map any thrown value to a structured MCP tool error result (never crash the server). */
export function toToolError(err: unknown): ToolErrorResult {
  const payload =
    err instanceof AppError
      ? { error: err.code, message: err.message }
      : {
          error: "INTERNAL",
          message: err instanceof Error ? err.message : String(err),
        };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}
