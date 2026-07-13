import { prisma } from "../database/prisma";
import { getClient } from "../utils/client";

export interface BoardEntry {
  userId: string;
  username: string;
  openCount: number;
  completedCount: number;
  totalCount: number;
  percent: number;
}

/**
 * Get the productivity board entries for a guild.
 * Includes all members who have bot accounts, excluding those opted out.
 */
export async function getBoard(guildId: string): Promise<BoardEntry[]> {
  const client = getClient();
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];

  // Get member IDs (excluding bots)
  const memberIds = guild.members.cache
    .filter((m) => !m.user.bot)
    .map((m) => m.id);

  if (memberIds.length === 0) return [];

  // Query users in memberIds who have not opted out (boardVisible !== false)
  const users = await prisma.user.findMany({
    where: {
      id: { in: memberIds },
      boardVisible: { not: false },
    },
    include: {
      todos: true,
    },
  });

  const entries: BoardEntry[] = users.map((user) => {
    const totalCount = user.todos.length;
    const completedCount = user.todos.filter((t) => t.done).length;
    const openCount = totalCount - completedCount;
    const percent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

    return {
      userId: user.id,
      username: user.username,
      openCount,
      completedCount,
      totalCount,
      percent,
    };
  });

  // Sort by completion percentage descending, with username as secondary tie-breaker
  return entries.sort((a, b) => b.percent - a.percent || a.username.localeCompare(b.username));
}
