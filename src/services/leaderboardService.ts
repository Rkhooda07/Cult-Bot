import { prisma } from "../database/prisma";
import { getClient } from "../utils/client";
import { DateTime } from "luxon";

export interface LeaderboardEntry {
  userId: string;
  username: string;
  xp: number;
  level: number;
}

export async function getLeaderboard(
  guildId: string,
  scope: "weekly" | "alltime"
): Promise<LeaderboardEntry[]> {
  const client = getClient();
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];

  const memberIds = guild.members.cache
    .filter((m) => !m.user.bot)
    .map((m) => m.id);

  if (memberIds.length === 0) return [];

  if (scope === "weekly") {
    const sevenDaysAgo = DateTime.now().minus({ days: 7 }).toJSDate();

    const xpLogs = await prisma.xPLog.findMany({
      where: {
        userId: { in: memberIds },
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

  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } },
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