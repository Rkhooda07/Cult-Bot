import { prisma } from "../database/prisma";
import { evaluate as evaluateBadges, EarnedBadgeInfo } from "./badgeService";

export interface XPResult {
  xpGained: number;
  newXP: number;
  newLevel: number;
  leveledUp: boolean;
  earnedBadges?: EarnedBadgeInfo[];
}

/**
 * Returns the cumulative XP required to complete level n.
 * Formula: xpForLevel(n) = 50 * n²
 */
export function xpForLevel(n: number): number {
  return 50 * n * n;
}

/**
 * Recalculates level for a given amount of cumulative XP.
 * Threshold to reach level L is xpForLevel(L - 1).
 * Level 1: [0, 50)
 * Level 2: [50, 200)
 * Level 3: [200, 450)
 * etc.
 * level = floor(sqrt(xp / 50)) + 1
 */
export function calculateLevel(xp: number): number {
  if (xp < 0) return 1;
  return Math.floor(Math.sqrt(xp / 50)) + 1;
}

/**
 * Award XP to a user, creating an XPLog entry and updating User.xp + User.level.
 * Returns the result with leveledUp flag and earnedBadges array.
 */
export async function award(
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

  // Automatically evaluate badges after any XP award event
  const earnedBadges = await evaluateBadges(userId);

  return { xpGained: amount, newXP, newLevel, leveledUp, earnedBadges };
}

/**
 * Legacy/compatibility helper for awarding XP (delegates to award).
 */
export async function awardXP(
  userId: string,
  amount: number,
  reason: string
): Promise<XPResult> {
  return award(userId, amount, reason);
}

export async function getUserXP(userId: string): Promise<{ xp: number; level: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { xp: true, level: true } });
  return { xp: user?.xp || 0, level: user?.level || 1 };
}