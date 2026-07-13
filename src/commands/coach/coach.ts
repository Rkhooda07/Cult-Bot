import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { commands } from "../../registry";
import { createEmbed, createErrorEmbed } from "../../utils/embedFactory";
import { logger } from "../../utils/logger";
import { getCoachNote } from "../../services/coachService";

commands.set("coach", {
  data: new SlashCommandBuilder()
    .setName("coach")
    .setDescription("Get your AI productivity coach note (cached 24h)"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ ephemeral: true });

    try {
      const userId = interaction.user.id;
      const note = await getCoachNote(userId);

      const embed = createEmbed("coach")
        .setTitle("🤖 AI Coach Note")
        .setDescription(note);

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error({ err: error, userId: interaction.user.id }, "Error generating coach note");
      await interaction.editReply({
        embeds: [createErrorEmbed("Failed to generate coach note. Please try again later.")],
      });
    }
  },
});