import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { commands, buttonHandlers } from "../../registry";
import { createEmbed } from "../../utils/embedFactory";
import { encode } from "../../utils/customId";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Slash command — /ping
// ---------------------------------------------------------------------------

commands.set("ping", {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription(
      "Verify the bot is online — returns latency and a router test button."
    ),

  execute: async (interaction) => {
    const latency = interaction.client.ws.ping;

    const embed = createEmbed("stats")
      .setTitle("🏓 Pong!")
      .setDescription(
        `Gateway latency: **${latency}ms**\n\nClick the button below to confirm the interaction router is dispatching correctly.`
      );

    // customId: ping:pong:<ownerId>:none
    const testButton = new ButtonBuilder()
      .setCustomId(encode("ping", "pong", interaction.user.id))
      .setLabel("Test Router")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔔");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(testButton);

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  },
});

// ---------------------------------------------------------------------------
// Button handler — ping:pong
// ---------------------------------------------------------------------------

buttonHandlers.set("ping:pong", async (interaction) => {
  logger.info(
    { userId: interaction.user.id, customId: interaction.customId },
    "ping:pong button dispatched — interaction router working"
  );

  const embed = createEmbed("stats")
    .setTitle("✅ Router confirmed!")
    .addFields(
      { name: "customId received", value: `\`${interaction.customId}\``, inline: false },
      { name: "Dispatched via", value: "`buttonHandlers.get(\"ping:pong\")`", inline: false }
    )
    .setDescription("The global interaction router decoded the customId and dispatched this click to the correct handler.");

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
});
