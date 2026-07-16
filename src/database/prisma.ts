import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { timingEnabled } from "../utils/timing";

// Singleton pattern: reuse the same client across hot-reloads in development
// and avoid opening more connections than needed in production.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const basePrisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

// DEBUG_TIMING: log each query's duration so "time in DB" is visible
// per-interaction in the logs (see src/utils/timing.ts). The extension is a
// no-op pass-through when timing is disabled, to keep this branch-free.
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!timingEnabled) return query(args);
        const start = process.hrtime.bigint();
        const result = await query(args);
        const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
        logger.debug({ model, action: operation, ms: Math.round(ms * 100) / 100 }, "[timing] prisma query");
        return result;
      },
    },
  },
});
