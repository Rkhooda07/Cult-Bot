import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface XPResult {
  xpGained: number;
  newXP: number;
  newLevel: number;
  leveledUp: boolean;
}

/**
 * Award XP to a user, bumping their level if threshold crossed.
 * Simple linear formula for Phase 2: level = floor(sqrt(xp / 100)) + 1
 * Full formula in Phase 3.
 */
export function calculateLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/**
 * Award XP to a user, creating an XPLog entry and updating User.xp + User.level.
 * Returns the result with leveledUp flag.
 */
export async function awardXP(
  userId: string,
  amount: number,
  reason: string
): Promise<XPResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const oldLevel = user.level;
  const newXP = user.xp + amount;
  const newLevel = calculateLevel(newXP);
  const leveledUp = newLevel > oldLevel;

  await prisma.$transaction([
    prisma.xPLog.create({
      data: { userId, amount, reason },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { xp: newXP, level: newLevel },
    }),
  ]);

  return { xpGained: amount, newXP, newLevel, leveledUp };
}

/**
 * Phase 2 stub — award flat +25 XP for completing a focus session.
 * Calls the real awardXP internally.
 */
export async function awardFocusCompletionXP(userId: string): Promise<XPResult> {
  return awardXP(userId, 25, "Focus session completed");
}

export async function getUserXP(userId: string): Promise<{ xp: number; level: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true, level: true } });
  return { xp: user?.xp || 0, level: user?.level || 1 };
}