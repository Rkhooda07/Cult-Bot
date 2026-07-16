import { prisma } from "../database/prisma";
import { badgeRegistry, UserStats } from "../badges/registry";
import { createEmbed } from "../utils/embedFactory";
import { getClient } from "../utils/client";
import { logger } from "../utils/logger";

export interface EarnedBadgeInfo {
  key: string;
  name: string;
  description: string;
  icon: string;
}

/**
 * Check the user's current stats against the badge registry
 * and award any newly-satisfied badges.
 *
 * Awards badges by writing UserBadge records to the database and sending
 * a "Badge Earned!" embed to the user's DMs.
 */
export async function evaluate(userId: string): Promise<EarnedBadgeInfo[]> {
  try {
    // 1. Fetch user stats + already-earned badges — four independent reads.
    const [goalsCompleted, streak, tasksCompleted, earnedUserBadges] = await Promise.all([
      prisma.goal.count({ where: { userId, status: "COMPLETED" } }),
      prisma.streak.findUnique({ where: { userId } }),
      prisma.todo.count({ where: { userId, done: true } }),
      prisma.userBadge.findMany({ where: { userId }, include: { badge: true } }),
    ]);
    const bestStreak = streak ? streak.best : 0;

    const stats: UserStats = {
      goalsCompleted,
      bestStreak,
      tasksCompleted,
    };

    const earnedKeys = new Set(earnedUserBadges.map((ub) => ub.badge.key));

    const newlyEarned: EarnedBadgeInfo[] = [];

    // 3. Check each rule in the registry
    for (const rule of badgeRegistry) {
      if (earnedKeys.has(rule.key)) {
        continue;
      }

      if (rule.check(stats)) {
        // Retrieve badge from DB
        const badge = await prisma.badge.findUnique({
          where: { key: rule.key },
        });

        if (!badge) {
          logger.error({ badgeKey: rule.key }, "Badge not found in database during evaluation. Did you seed?");
          continue;
        }

        // Award badge in DB
        await prisma.userBadge.create({
          data: {
            userId,
            badgeId: badge.id,
          },
        });

        const badgeInfo = {
          key: badge.key,
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
        };
        newlyEarned.push(badgeInfo);

        // Send a one-off "Badge Earned!" DM to the user
        try {
          const client = getClient();
          const discordUser = await client.users.fetch(userId);
          if (discordUser) {
            const embed = createEmbed("badges")
              .setTitle("🏆 Badge Earned!")
              .setDescription(
                `Congratulations, **${discordUser.username}**! You've earned a new badge:\n\n` +
                `${badge.icon} **${badge.name}**\n` +
                `*${badge.description}*`
              )
              .setThumbnail(discordUser.displayAvatarURL())
              .setFooter({ text: `DevOS • ${discordUser.username}` });

            await discordUser.send({ embeds: [embed] });
            logger.info({ userId, badgeKey: badge.key }, "Sent Badge Earned DM to user");
          }
        } catch (dmErr) {
          // Log DM failure but don't disrupt execution flow
          logger.warn({ userId, badgeKey: badge.key, err: dmErr }, "Could not send Badge Earned DM (user may have DMs closed)");
        }
      }
    }

    return newlyEarned;
  } catch (error) {
    logger.error({ userId, error }, "Error evaluating badges for user");
    return [];
  }
}
