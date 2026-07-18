import type { Guild } from "discord.js";
import { getClient } from "./client";
import { logger } from "./logger";

/**
 * Guild member cache helpers.
 *
 * discord.js only auto-populates `guild.members.cache` for guilds *below* the
 * ~50-member "large guild" threshold. On any real server above that size the
 * cache is empty or partial until members are explicitly fetched — so every
 * member-dependent feature (board, leaderboard, streak, broadcast, weekly
 * recap) reads a truncated member list and silently under-reports.
 *
 * Both helpers here require the GuildMembers privileged intent (enabled in
 * index.ts and the Developer Portal). They fail soft: on error they log and
 * leave whatever is already cached, so a feature degrades to partial data
 * instead of throwing.
 */

/**
 * Ensure a single guild's full member list is in cache before code reads
 * `guild.members.cache`. Fetches all members (one gateway request, cached by
 * discord.js for the process lifetime).
 */
export async function ensureMembersCached(guild: Guild): Promise<void> {
  try {
    await guild.members.fetch();
  } catch (err) {
    logger.warn(
      { err, guildId: guild.id },
      "ensureMembersCached: failed to fetch guild members — member list may be incomplete"
    );
  }
}

/**
 * Return every guild the bot shares with `userId`.
 *
 * Uses a *targeted* per-user fetch per guild rather than fetching every
 * member of every guild — cheaper, and it populates the exact cache entry a
 * `guild.members.cache.has(userId)` check would otherwise miss on a large
 * server. A user who isn't a member throws "Unknown Member", which we treat
 * as "not shared".
 */
export async function getSharedGuildsForUser(userId: string): Promise<Guild[]> {
  const client = getClient();
  const shared: Guild[] = [];

  for (const guild of client.guilds.cache.values()) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) shared.push(guild);
  }

  return shared;
}
