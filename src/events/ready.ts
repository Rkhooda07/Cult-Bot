import type { Client } from "discord.js";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import { ICON_LOCAL_PATH } from "../config/branding";

export function registerReadyEvent(client: Client): void {
  client.once("ready", async (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Bot ready");

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
