import type { Client } from "discord.js";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import { ICON_LOCAL_PATH } from "../config/branding";

export function registerReadyEvent(client: Client): void {
  client.once("ready", async (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Bot ready");

    // TEMP: remove after M9 real-server verification.
    // Reports the cold member-cache state per guild. Discord does not populate
    // guild.members.cache for guilds above the ~50-member "large guild"
    // threshold, so a size well below memberCount here is the exact condition
    // M9's ensureMembersCached()/getSharedGuildsForUser() exist to correct.
    // Read-only on purpose — it must NOT warm the cache, or it would mask the
    // very state we are trying to observe.
    for (const guild of readyClient.guilds.cache.values()) {
      logger.info(
        {
          guildId: guild.id,
          guildName: guild.name,
          cachedMembers: guild.members.cache.size,
          memberCount: guild.memberCount,
          large: guild.large,
        },
        "TEMP M9 debug: guild member cache state at ready"
      );
    }

    // Opt-in, one-shot avatar set. Discord rate-limits profile picture changes
    // to ~a couple per hour, so this only runs when AUTO_SET_AVATAR is
    // explicitly "true" and is never retried — repeated dev restarts would
    // otherwise start failing. The recommended path is uploading the icon
    // manually via the Discord Developer Portal (see .env.example).
    if (env.AUTO_SET_AVATAR === "true") {
      try {
        await readyClient.user.setAvatar(ICON_LOCAL_PATH);
        logger.info({ path: ICON_LOCAL_PATH }, "Bot avatar set from local asset");
      } catch (err) {
        logger.error(
          { err, path: ICON_LOCAL_PATH },
          "Failed to set bot avatar (rate limit or missing file?)"
        );
      }
    }
  });
}
