import type { Client } from "discord.js";
import type { Logger } from "pino";

export function registerReadyEvent(client: Client, logger: Logger): void {
  client.once("ready", (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Bot ready");
  });
}
