import pino from "pino";

/**
 * Shared pino logger singleton.
 * Imported by any module that needs structured logging — never use console.log.
 */
export const logger = pino({
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
