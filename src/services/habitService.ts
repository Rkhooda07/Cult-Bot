import { prisma } from "../database/prisma";
import { z } from "zod";
import { DateTime } from "luxon";
import { award } from "./xpService";
import { updateStreak } from "./streakService";
import { logger } from "../utils/logger";

export const habitNameSchema = z.string().min(1).max(100).trim();

export type HabitFrequency = "DAILY" | "WEEKLY";

export interface HabitItem {
  id: string;
  userId: string;
  name: string;
  frequency: HabitFrequency;
  createdAt: Date;
  /** Whether the habit has a HabitLog entry for today (in the user's timezone). */
  completedToday: boolean;
}

export async function ensureUser(userId: string, username: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    update: { username },
    create: { id: userId, username },
  });
}

/**
 * Create a new Habit record for the user.
 * Called after the two-step modal → frequency-select flow completes.
 */
export async function createHabit(
  userId: string,
  name: string,
  frequency: HabitFrequency
): Promise<HabitItem> {
  const habit = await prisma.habit.create({
    data: { userId, name, frequency },
  });

  return mapHabit(habit, false);
}

/**
 * Return all habits for a user, each annotated with whether it was
 * completed today in the user's stored timezone.
 */
export async function listHabits(userId: string): Promise<HabitItem[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      habits: {
        orderBy: { createdAt: "asc" },
        include: { logs: { orderBy: { date: "desc" }, take: 1 } },
      },
    },
  });

  if (!user) return [];

  const timezone = user.timezone || "UTC";
  const todayStart = DateTime.now().setZone(timezone).startOf("day").toJSDate();
  const todayEnd = DateTime.now().setZone(timezone).endOf("day").toJSDate();

  return user.habits.map((h) => {
    const lastLog = h.logs[0];
    const completedToday =
      !!lastLog &&
      lastLog.date >= todayStart &&
      lastLog.date <= todayEnd &&
      lastLog.completed;

    return mapHabit(h, completedToday);
  });
}

/**
 * Toggle today's HabitLog for a habit.
 * If already logged today → removes the log (un-checks).
 * If not logged → creates the log and awards 5 XP + updates streak.
 * Returns `true` when checked off, `false` when un-checked.
 */
export async function toggleHabitToday(
  userId: string,
  habitId: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const timezone = user?.timezone || "UTC";

  const todayStart = DateTime.now().setZone(timezone).startOf("day").toJSDate();
  const todayEnd = DateTime.now().setZone(timezone).endOf("day").toJSDate();

  const existingLog = await prisma.habitLog.findFirst({
    where: {
      habitId,
      date: { gte: todayStart, lte: todayEnd },
    },
  });

  if (existingLog) {
    // Un-check: remove the log entry
    await prisma.habitLog.delete({ where: { id: existingLog.id } });
    logger.info({ userId, habitId }, "Habit un-checked for today");
    return false;
  }

  // Check off: create log, award XP, update streak
  await prisma.habitLog.create({
    data: {
      habitId,
      date: new Date(),
      completed: true,
    },
  });

  await updateStreak(userId);
  await award(userId, 5, "habit_logged");

  logger.info({ userId, habitId }, "Habit checked off for today, +5 XP");
  return true;
}

/**
 * Delete a habit (and all its logs via cascade).
 */
export async function deleteHabit(
  userId: string,
  habitId: string
): Promise<boolean> {
  // Delete logs first (no cascade set in schema)
  await prisma.habitLog.deleteMany({ where: { habitId } });

  const result = await prisma.habit.deleteMany({
    where: { id: habitId, userId },
  });

  return result.count > 0;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapHabit(
  h: { id: string; userId: string; name: string; frequency: string; createdAt: Date },
  completedToday: boolean
): HabitItem {
  return {
    id: h.id,
    userId: h.userId,
    name: h.name,
    frequency: h.frequency as HabitFrequency,
    createdAt: h.createdAt,
    completedToday,
  };
}
