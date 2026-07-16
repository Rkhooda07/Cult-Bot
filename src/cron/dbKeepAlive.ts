import cron from "node-cron";
import { logger } from "../utils/logger";
import { prisma } from "../database/prisma";

/**
 * Keeps the DB connection warm on serverless Postgres providers (e.g. Neon)
 * that auto-suspend their compute after a few minutes idle. A cold "wake"
 * after suspend can take several seconds and was surfacing as user-visible
 * failures on the first command after any gap in traffic. Pinging well
 * inside the provider's suspend window keeps the compute continuously
 * active for as long as the bot process is running.
 */
export function startDbKeepAlive(): void {
  cron.schedule("*/4 * * * *", async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      logger.debug("DB keep-alive ping succeeded");
    } catch (err) {
      logger.warn({ err }, "DB keep-alive ping failed (non-fatal)");
    }
  });

  logger.info("DB keep-alive ping started (every 4 min)");
}
