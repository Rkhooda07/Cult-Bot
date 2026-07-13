import { prisma } from "../database/prisma";
import { DateTime } from "luxon";

export interface LeaderboardEntry {
  userId: string;
  username: string;
  xp: number;
  level: number;
}

export async function getLeaderboard(guildId: string, scope: "weekly" | "alltime"): Promise<LeaderboardEntry[]> {
  const memberIds = await getGuildMemberIds(guildId);
  if (memberIds.length === 0) return [];

  if (scope === "weekly") {
    return getWeeklyLeaderboard(memberIds);
  }

  return getAllTimeLeaderboard(memberIds);
}

async function getGuildMemberIds(guildId: string): Promise<string[]> {
  const guild = await prisma.guildSettings.findUnique({
    where: { id: guildId },
    select: { id: true },
  });

  if (!guild) return [];

  // Since we don't have guild member tracking in the DB yet,
  // we need to rely on the client's cache or just return all users.
  // For now, return all users - in production this would filter by guild members.
  // This will be updated when we have guild member tracking.
  const users = await prisma.user.findMany({
    select: { id: true },
  });

  return users.map((u) => u.id);
}

async function getAllTimeLeaderboard(userIds: string[]): Promise<LeaderboardEntry[]> {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, xp: true, level: true },
    orderBy: { xp: "desc" },
    take: 10,
  });

  return users.map((u) => ({
    userId: u.id,
    username: u.username,
    xp: u.xp,
    level: u.level,
  }));
}

async function getWeeklyLeaderboard(userIds: string[]): Promise<LeaderboardEntry[]> {
  const sevenDaysAgo = DateTime.now().minus({ days: 7 }).toJSDate();

  const xpLogs = await prisma.xPLog.findMany({
    where: {
      userId: { in: userIds },
      createdAt: { gte: sevenDaysAgo },
    },
    select: { userId: true, amount: true },
  });

  const xpByUser = new Map<string, number>();
  for (const log of xpLogs) {
    xpByUser.set(log.userId, (xpByUser.get(log.userId) || 0) + log.amount);
  }

  const sorted = Array.from(xpByUser.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const userIdsTop = sorted.map(([id]) => id);
  const users = await prisma.user.findMany({
    where: { id: { in: userIdsTop } },
    select: { id: true, username: true, xp: true, level: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  return sorted.map(([userId, xp]) => {
    const user = userMap.get(userId);
    return {
      userId,
      username: user?.username || "Unknown",
      xp,
      level: user?.level || 1,
    };
  });
}