import pino from "pino";

/**
 * Shared pino logger singleton.
 * Imported by any module that needs structured logging — never use console.log.
 */
export const logger = pino({
  level: process.env.DEBUG_TIMING === "true" ? "debug" : process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
