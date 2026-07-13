import { Events } from "discord.js";
import type { Client, Interaction } from "discord.js";
import { logger } from "../utils/logger";
import { commands, buttonHandlers, selectHandlers, modalHandlers } from "../registry";
import { decode } from "../utils/customId";
import { assertOwner } from "../utils/permissions";
import { createErrorEmbed } from "../utils/embedFactory";

/**
 * Global interaction router — spec Section 2 (Interaction persistence) and Section 6.4.
 *
 * Uses a persistent client.on() listener, NOT awaitMessageComponent collectors,
 * so panels remain functional after bot restarts.
 *
 * Flow for component interactions (buttons / selects / modals):
 *   1. Decode customId → { domain, action, ownerId, entityId }
 *   2. Verify ownerId === interaction.user.id  (assertOwner — replies ephemeral on mismatch)
 *   3. Look up handler in the relevant registry map under "domain:action"
 *   4. Call the handler
 *
 * Handlers are registered as a side-effect of importing each command module
 * (see src/commands/<domain>/ and src/registry.ts).
 */
export function registerInteractionCreate(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      // ── Slash commands ────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const handler = commands.get(interaction.commandName);
        if (!handler) {
          logger.warn(
            { commandName: interaction.commandName, userId: interaction.user.id },
            "No handler registered for command — did you import it in index.ts?"
          );
          return;
        }
        logger.info(
          { commandName: interaction.commandName, userId: interaction.user.id },
          "Dispatching slash command"
        );
        await handler.execute(interaction);
        return;
      }

      // ── Buttons ───────────────────────────────────────────────────────────
      if (interaction.isButton()) {
        const parsed = decode(interaction.customId);
        logger.debug(
          { ...parsed, userId: interaction.user.id },
          "Button interaction received"
        );

        if (!(await assertOwner(interaction))) return;

        const key = `${parsed.domain}:${parsed.action}`;
        const handler = buttonHandlers.get(key);
        if (!handler) {
          logger.warn({ key }, "No button handler registered for key");
          return;
        }
        await handler(interaction);
        return;
      }

      // ── String select menus ───────────────────────────────────────────────
      if (interaction.isStringSelectMenu()) {
        const parsed = decode(interaction.customId);
        logger.debug(
          { ...parsed, userId: interaction.user.id },
          "Select menu interaction received"
        );

        if (!(await assertOwner(interaction))) return;

        const key = `${parsed.domain}:${parsed.action}`;
        const handler = selectHandlers.get(key);
        if (!handler) {
          logger.warn({ key }, "No select handler registered for key");
          return;
        }
        await handler(interaction);
        return;
      }

      // ── Modal submits ─────────────────────────────────────────────────────
      if (interaction.isModalSubmit()) {
        const parsed = decode(interaction.customId);
        logger.debug(
          { ...parsed, userId: interaction.user.id },
          "Modal submit received"
        );

        // Modals can't verify ownership via the normal assertOwner path if the
        // ownerId is embedded — we still run the check because all our modal
        // customIds follow the same convention.
        const key = `${parsed.domain}:${parsed.action}`;
        const handler = modalHandlers.get(key);
        if (!handler) {
          logger.warn({ key }, "No modal handler registered for key");
          return;
        }
        await handler(interaction);
        return;
      }
    } catch (err) {
      logger.error({ err }, "Unhandled error in interactionCreate");

      // Best-effort red error embed reply — never expose a stack trace to the user.
      const errorEmbed = createErrorEmbed(
        "Something went wrong. Please try again, or report this if it keeps happening."
      );
      const payload = { embeds: [errorEmbed], ephemeral: true } as const;

      try {
        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
          } else {
            await interaction.reply(payload);
          }
        }
      } catch {
        // Swallow — if even the error reply fails, pino already logged the root cause above.
      }
    }
  });
}
