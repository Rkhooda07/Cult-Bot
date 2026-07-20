import { EmbedBuilder, TextChannel, ChannelType } from "discord.js";
import { prisma } from "../database/prisma";
import { getClient } from "../utils/client";
import { logger } from "../utils/logger";
import { COLORS } from "../utils/embedFactory";
import { getStreak } from "./streakService";
import { getSharedGuildsForUser } from "../utils/guildMembers";

/**
 * Activity Broadcast System — spec Section 12.
 *
 * Shared broadcaster reused by every integration poller (GitHub here, LeetCode
 * and Codeforces in Prompts 14-15). A source detects new activity, awards XP,
 * then calls broadcast() to (optionally) announce it in each shared guild that
 * has configured an announce channel.
 *
 * Design notes:
 *  - Takes structured input, never a raw string, so every source produces a
 *    consistently-formatted, celebratory embed.
 *  - Per-guild opt-in: a guild only receives broadcasts if an admin has run
 *    `/settings announce-channel #channel`. No config = no broadcast there.
 *  - Per-user opt-out: `User.broadcastEnabled === false` suppresses everything.
 */

export interface BroadcastInput {
  /** Source-specific emoji (e.g. "🚀" for commits). */
  emoji: string;
  /** Short, celebratory, source-specific title (e.g. "New Commit Shipped!"). */
  title: string;
  /** 1-2 line description of what the user did (e.g. "pushed 3 commits to `FlowPane`"). */
  description: string;
  /** XP awarded for this activity, shown inline in the embed. */
  xpAwarded: number;
}

/**
 * Broadcast a user's dev activity to every shared guild that has an announce
 * channel configured. See Section 12 for the exact ordering.
 *
 * This never throws — broadcasting is a best-effort, morale-boosting side
 * effect of the poller, and a failure to post must not roll back the XP award
 * or crash the cron run. All errors are logged and swallowed.
 */
export async function broadcast(
  userId: string,
  input: BroadcastInput
): Promise<void> {
  try {
    // 1. Respect the per-user opt-out. XP has already been awarded by the caller.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { broadcastEnabled: true },
    });

    if (!user) {
      logger.warn({ userId }, "broadcast: user not found, skipping");
      return;
    }

    if (!user.broadcastEnabled) {
      logger.debug({ userId }, "broadcast: user has broadcasts disabled, skipping");
      return;
    }

    const client = getClient();

    // 2. Resolve the Discord user (for avatar + display name) once.
    const discordUser = await client.users.fetch(userId).catch(() => null);
    const displayName = discordUser?.username ?? "Someone";
    const avatarUrl = discordUser?.displayAvatarURL() ?? null;

    // Current streak — shown as an ambient, always-on leaderboard signal.
    const streak = await getStreak(userId);

    // 2b. Find every guild the bot shares with this user. Uses a targeted
    //     per-guild member fetch (see getSharedGuildsForUser) rather than
    //     reading guild.members.cache directly, which is empty/partial on
    //     servers above the large-guild threshold. Requires the GuildMembers
    //     privileged intent (enabled in index.ts and the Portal).
    const sharedGuilds = await getSharedGuildsForUser(userId);

    if (sharedGuilds.length === 0) {
      logger.debug(
        { userId },
        "broadcast: no shared guilds found (is the GuildMembers intent enabled?)"
      );
      return;
    }

    // 3. Build the celebratory embed once, post to each configured channel.
    const embed = buildBroadcastEmbed({
      input,
      displayName,
      avatarUrl,
      currentStreak: streak.current,
    });

    for (const guild of sharedGuilds) {
      const guildId = guild.id;
      try {
        const settings = await prisma.guildSettings.findUnique({
          where: { id: guildId },
          select: { announceChannelId: true },
        });

        // No announce channel configured = no broadcast in this guild.
        // This per-guild opt-in is the entire configuration mechanism.
        if (!settings?.announceChannelId) continue;

        const channel = await client.channels
          .fetch(settings.announceChannelId)
          .catch(() => null);

        if (
          !channel ||
          !channel.isTextBased() ||
          channel.type === ChannelType.DM
        ) {
          logger.warn(
            { guildId, channelId: settings.announceChannelId },
            "broadcast: announce channel missing or not a guild text channel"
          );
          continue;
        }

        await (channel as TextChannel).send({ embeds: [embed] });
        logger.info(
          { userId, guildId, channelId: settings.announceChannelId, title: input.title },
          "broadcast: posted activity embed"
        );
      } catch (err) {
        logger.error(
          { err, userId, guildId },
          "broadcast: failed to post to guild announce channel"
        );
      }
    }
  } catch (err) {
    // Never let a broadcast failure bubble up into the poller.
    logger.error({ err, userId }, "broadcast: unexpected error");
  }
}

function buildBroadcastEmbed(args: {
  input: BroadcastInput;
  displayName: string;
  avatarUrl: string | null;
  currentStreak: number;
}): EmbedBuilder {
  const { input, displayName, avatarUrl, currentStreak } = args;

  const embed = new EmbedBuilder()
    // Celebratory XP gold per Section 12.
    .setColor(COLORS.xp)
    .setTitle(`${input.emoji} ${input.title}`)
    .setDescription(
      `**${displayName}** ${input.description} — **+${input.xpAwarded} XP**`
    )
    .setFooter({ text: "CultBot" })
    .setTimestamp();

  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  // Only surface the streak when they actually have one going.
  if (currentStreak > 0) {
    embed.addFields({
      name: "🔥 Current Streak",
      value: `${currentStreak} day${currentStreak === 1 ? "" : "s"}`,
      inline: true,
    });
  }

  return embed;
}
