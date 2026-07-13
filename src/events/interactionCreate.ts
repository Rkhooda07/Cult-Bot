import type { Client, Interaction } from "discord.js";
import type { Logger } from "pino";

/**
 * Global interaction router.
 *
 * Parses the customId using the convention: domain:action:ownerId:entityId
 * (see Section 6.4 of the spec) and dispatches to the appropriate handler.
 *
 * Uses persistent event listeners — NOT awaitMessageComponent collectors —
 * so panels remain functional after bot restarts (Section 2, Interaction persistence).
 */
export function registerInteractionCreateEvent(
  client: Client,
  logger: Logger
): void {
  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        logger.info(
          { commandName: interaction.commandName, userId: interaction.user.id },
          "Slash command received"
        );
        // Command handlers will be wired here in later phases
        return;
      }

      if (
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isModalSubmit()
      ) {
        const customId = interaction.customId;
        logger.info({ customId, userId: interaction.user.id }, "Interaction received");

        // TODO: parse domain:action:ownerId:entityId and dispatch to handlers
        // Full router implementation comes in Phase 1 command prompts
        return;
      }
    } catch (err) {
      logger.error({ err }, "Unhandled error in interactionCreate");
    }
  });
}
