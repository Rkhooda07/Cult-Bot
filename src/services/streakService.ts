import { prisma } from "../database/prisma";
import { DateTime } from "luxon";
import { logger } from "../utils/logger";

export interface StreakItem {
  id: string;
  userId: string;
  current: number;
  best: number;
  lastActiveDate: Date | null;
}

/**
 * Increment or initialize a user's streak when they complete an active task
 * (todo, goal, or focus session).
 */
export async function updateStreak(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { streak: true },
    });

    if (!user) {
      logger.warn({ userId }, "User not found when updating streak");
      return;
    }

    const timezone = user.timezone || "UTC";
    const now = DateTime.now().setZone(timezone);
    const today = now.startOf("day");

    const streak = user.streak;

    if (!streak) {
      // Create new streak record with initial active day
      await prisma.streak.create({
        data: {
          userId,
          current: 1,
          best: 1,
          lastActiveDate: new Date(),
        },
      });
      logger.info({ userId }, "Created new streak record with streak of 1");
      return;
    }

    if (!streak.lastActiveDate) {
      // Initialize existing but empty streak record
      await prisma.streak.update({
        where: { id: streak.id },
        data: {
          current: 1,
          best: Math.max(streak.best, 1),
          lastActiveDate: new Date(),
        },
      });
      logger.info({ userId }, "Updated empty streak record with streak of 1");
      return;
    }

    const lastActive = DateTime.fromJSDate(streak.lastActiveDate).setZone(timezone).startOf("day");
    const diff = today.diff(lastActive, "days").days;

    if (diff <= 0) {
      // Already active today, just update lastActiveDate timestamp to keep it fresh
      await prisma.streak.update({
        where: { id: streak.id },
        data: {
          lastActiveDate: new Date(),
        },
      });
      logger.debug({ userId }, "User already active today, updated lastActiveDate");
    } else if (diff === 1) {
      // Consecutive active day!
      const newCurrent = streak.current + 1;
      const newBest = Math.max(streak.best, newCurrent);

      await prisma.streak.update({
        where: { id: streak.id },
        data: {
          current: newCurrent,
          best: newBest,
          lastActiveDate: new Date(),
        },
      });
      logger.info({ userId, current: newCurrent, best: newBest }, "Streak incremented");
    } else {
      // Streak broken (missed at least one day)
      const newCurrent = 1;
      const newBest = Math.max(streak.best, 1);

      await prisma.streak.update({
        where: { id: streak.id },
        data: {
          current: newCurrent,
          best: newBest,
          lastActiveDate: new Date(),
        },
      });
      logger.info({ userId, previousCurrent: streak.current, newBest }, "Streak broken and reset to 1");
    }
  } catch (error) {
    logger.error({ userId, error }, "Error updating user streak");
  }
}

/**
 * Get a user's streak details.
 */
export async function getStreak(userId: string): Promise<StreakItem> {
  const streak = await prisma.streak.findUnique({
    where: { userId },
  });

  if (!streak) {
    return {
      id: "",
      userId,
      current: 0,
      best: 0,
      lastActiveDate: null,
    };
  }

  return {
    id: streak.id,
    userId: streak.userId,
    current: streak.current,
    best: streak.best,
    lastActiveDate: streak.lastActiveDate,
  };
}
