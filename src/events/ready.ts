import type { Client } from "discord.js";
import { logger } from "../utils/logger";

export function registerReadyEvent(client: Client): void {
  client.once("ready", (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Bot ready");
  });
}
