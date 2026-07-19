/** stdout carries the MCP protocol stream — all logging must go to stderr. */
export const logger = {
  info(message: string, ...args: unknown[]): void {
    console.error(`[design-research] ${message}`, ...args);
  },
  warn(message: string, ...args: unknown[]): void {
    console.error(`[design-research] WARN ${message}`, ...args);
  },
  error(message: string, ...args: unknown[]): void {
    console.error(`[design-research] ERROR ${message}`, ...args);
  },
};
