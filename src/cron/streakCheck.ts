import cron from "node-cron";
import { Client } from "discord.js";
import { DateTime } from "luxon";
import { logger } from "../utils/logger";
import { prisma } from "../database/prisma";

let isRunning = false;

/**
 * Streak check cron job.
 * Runs every hour at the top of the hour.
 *
 * It checks each user's timezone. If it is currently the 00:00 (midnight) hour in
 * the user's timezone, it evaluates if they completed any task (todo, goal, or focus session)
 * yesterday. If not, their current streak is reset to 0.
 *
 * NOTE: Timezone-aware execution runs hourly. If per-timezone hourly scheduling
 * is not ideal, running once daily in UTC would be a fallback, but this hourly
 * implementation is timezone-aware and runs just after midnight in each user's timezone.
 */
export function startStreakCheck(client: Client): void {
  cron.schedule("0 * * * *", async () => {
    if (isRunning) {
      logger.debug("Streak check skipped — previous run still in progress");
      return;
    }

    isRunning = true;

    try {
      logger.info("Running timezone-aware streak check...");

      const users = await prisma.user.findMany({
        include: { streak: true },
      });

      const nowUtc = DateTime.utc();

      for (const user of users) {
        try {
          const timezone = user.timezone || "UTC";
          const userTime = nowUtc.setZone(timezone);

          // Only run the streak check for users where the local time is in the midnight hour (00:XX)
          if (userTime.hour !== 0) {
            continue;
          }

          logger.info(
            { userId: user.id, timezone, userTime: userTime.toISO() },
            "Checking streak for user at midnight local time"
          );

          const streak = user.streak;
          if (!streak) {
            continue;
          }

          // If current streak is already 0, nothing to reset
          if (streak.current === 0) {
            continue;
          }

          // Yesterday is userTime minus 1 day
          const yesterday = userTime.minus({ days: 1 }).startOf("day");

          if (!streak.lastActiveDate) {
            // No activity ever recorded, reset current to 0
            await prisma.streak.update({
              where: { id: streak.id },
              data: { current: 0 },
            });
            logger.info({ userId: user.id }, "Reset streak to 0 (no lastActiveDate)");
            continue;
          }

          const lastActive = DateTime.fromJSDate(streak.lastActiveDate).setZone(timezone).startOf("day");

          // If lastActive is neither yesterday nor today, the user missed yesterday, so reset streak to 0
          const isYesterdayActive = lastActive.hasSame(yesterday, "day");
          const isTodayActive = lastActive.hasSame(userTime.startOf("day"), "day");

          if (!isYesterdayActive && !isTodayActive) {
            await prisma.streak.update({
              where: { id: streak.id },
              data: { current: 0 },
            });
            logger.info(
              { userId: user.id, lastActive: lastActive.toISO() },
              "Reset streak to 0 (yesterday was not active)"
            );
          }
        } catch (err) {
          logger.error({ userId: user.id, err }, "Error checking streak for user");
        }
      }
    } catch (err) {
      logger.error({ err }, "Error in streak check cron job");
    } finally {
      isRunning = false;
    }
  });

  logger.info("Streak check cron job scheduled (every hour)");
}
