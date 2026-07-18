import cron from "node-cron";
import { Client, TextChannel, ChannelType } from "discord.js";
import { DateTime } from "luxon";
import { logger } from "../utils/logger";
import { prisma } from "../database/prisma";
import { createEmbed } from "../utils/embedFactory";
import { getSharedGuildsForUser } from "../utils/guildMembers";

let isRunning = false;

/**
 * Weekly Recap Cron Job.
 * Runs every hour at the top of the hour.
 *
 * For each user, if the local time in their timezone is Sunday 20:00 (8:00 PM),
 * we compile a weekly productivity recap (tasks completed, focus hours, goals completed,
 * XP earned in the past 7 days).
 *
 * If the user has broadcastEnabled, it posts the recap in all shared guilds' announce channels.
 * Otherwise, or if no announce channels are set or delivery fails, it sends a DM.
 */
export function startWeeklyRecap(client: Client): void {
  cron.schedule("0 * * * *", async () => {
    if (isRunning) {
      logger.debug("Weekly recap cron skipped — previous run still in progress");
      return;
    }

    isRunning = true;

    try {
      logger.info("Running timezone-aware weekly recap check...");

      const users = await prisma.user.findMany();
      const nowUtc = DateTime.utc();

      for (const user of users) {
        try {
          const timezone = user.timezone || "UTC";
          const userTime = nowUtc.setZone(timezone);

          // Check if local time is Sunday at 20:00
          if (userTime.weekday !== 7 || userTime.hour !== 20) {
            continue;
          }

          logger.info(
            { userId: user.id, timezone, userTime: userTime.toISO() },
            "Generating weekly recap for user"
          );

          // Activity window: past 7 days
          const end = userTime.toJSDate();
          const start = userTime.minus({ days: 7 }).toJSDate();

          // 1. Tasks completed
          const tasksCompleted = await prisma.todo.count({
            where: {
              userId: user.id,
              done: true,
              doneAt: { gte: start, lte: end },
            },
          });

          // 2. Focus time & sessions completed
          const focusSessions = await prisma.pomodoroSession.findMany({
            where: {
              userId: user.id,
              status: "COMPLETED",
              completedAt: { gte: start, lte: end },
            },
            select: { durationMin: true },
          });
          const completedFocusCount = focusSessions.length;
          const totalFocusMinutes = focusSessions.reduce((sum, s) => sum + s.durationMin, 0);
          const focusHours = parseFloat((totalFocusMinutes / 60).toFixed(1));

          // 3. Goals completed
          const goalsCompleted = await prisma.goal.count({
            where: {
              userId: user.id,
              status: "COMPLETED",
              completedAt: { gte: start, lte: end },
            },
          });

          // 4. XP earned
          const xpEarnedRaw = await prisma.xPLog.aggregate({
            where: {
              userId: user.id,
              createdAt: { gte: start, lte: end },
            },
            _sum: { amount: true },
          });
          const xpEarned = xpEarnedRaw._sum.amount ?? 0;

          // Skip if zero activity in past 7 days to avoid spam
          if (tasksCompleted === 0 && completedFocusCount === 0 && goalsCompleted === 0 && xpEarned === 0) {
            logger.info({ userId: user.id }, "Skipped weekly recap: zero activity");
            continue;
          }

          const discordUser = await client.users.fetch(user.id).catch(() => null);

          // Build recap embed (using stats green color)
          const embed = createEmbed("stats")
            .setTitle("📈 Weekly Productivity Recap")
            .setDescription(`Here's a summary of your achievements in DevOS over the past 7 days!`)
            .addFields(
              {
                name: "📝 Tasks Completed",
                value: `**${tasksCompleted}** task${tasksCompleted === 1 ? "" : "s"}`,
                inline: true,
              },
              {
                name: "🍅 Focus Time",
                value: `**${focusHours}h** (${completedFocusCount} session${completedFocusCount === 1 ? "" : "s"})`,
                inline: true,
              },
              {
                name: "🎯 Goals Finished",
                value: `**${goalsCompleted}** goal${goalsCompleted === 1 ? "" : "s"}`,
                inline: true,
              },
              {
                name: "🏆 XP Earned",
                value: `**+${xpEarned} XP**`,
                inline: true,
              }
            );

          if (discordUser) {
            embed.setThumbnail(discordUser.displayAvatarURL());
          }

          let sent = false;

          // Attempt guild channel announcements if enabled
          if (user.broadcastEnabled) {
            // Targeted per-guild membership resolution — guild.members.cache is
            // empty/partial on servers above the large-guild threshold.
            const sharedGuilds = await getSharedGuildsForUser(user.id);

            for (const guild of sharedGuilds) {
              const guildId = guild.id;
              try {
                const settings = await prisma.guildSettings.findUnique({
                  where: { id: guildId },
                  select: { announceChannelId: true },
                });

                if (settings?.announceChannelId) {
                  const channel = await client.channels.fetch(settings.announceChannelId).catch(() => null);

                  if (channel && channel.isTextBased() && channel.type !== ChannelType.DM) {
                    await (channel as TextChannel).send({
                      content: `📊 **Weekly Recap for <@${user.id}>**`,
                      embeds: [embed],
                    });
                    sent = true;
                    logger.info(
                      { userId: user.id, guildId, channelId: settings.announceChannelId },
                      "Weekly recap posted to guild announce channel"
                    );
                  }
                }
              } catch (err) {
                logger.error(
                  { err, userId: user.id, guildId },
                  "Failed to post weekly recap to guild announce channel"
                );
              }
            }
          }

          // Fallback to DM if not sent via guild announcements or if disabled
          if (!sent) {
            if (discordUser) {
              try {
                await discordUser.send({ embeds: [embed] });
                sent = true;
                logger.info({ userId: user.id }, "Weekly recap sent via DM");
              } catch (err) {
                logger.warn({ err, userId: user.id }, "Failed to send weekly recap DM");
              }
            } else {
              logger.warn({ userId: user.id }, "Could not fetch Discord user for weekly recap DM");
            }
          }
        } catch (err) {
          logger.error({ userId: user.id, err }, "Error generating weekly recap for user");
        }
      }
    } catch (err) {
      logger.error({ err }, "Error in weekly recap cron job");
    } finally {
      isRunning = false;
    }
  });

  logger.info("Weekly recap cron job scheduled (every hour)");
}
