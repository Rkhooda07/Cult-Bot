import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { commands } from "../../registry";
import { createEmbed, createErrorEmbed } from "../../utils/embedFactory";
import { logger } from "../../utils/logger";
import { getLeaderboard } from "../../services/leaderboardService";

commands.set("leaderboard", {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the guild leaderboard (top 10 by XP)")
    .addStringOption((option) =>
      option
        .setName("scope")
        .setDescription("Leaderboard time scope")
        .setRequired(false)
        .addChoices(
          { name: "All Time", value: "alltime" },
          { name: "Weekly", value: "weekly" }
        )
    ) as unknown as SlashCommandBuilder,

  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        embeds: [createErrorEmbed("This command can only be used in a server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const scope = (interaction.options.getString("scope") as "weekly" | "alltime") || "alltime";
    await interaction.deferReply();

    try {
      const entries = await getLeaderboard(guildId, scope);

      if (entries.length === 0) {
        await interaction.editReply({
          embeds: [
            createEmbed("leaderboard").setTitle("🏆 Leaderboard").setDescription("No data yet. Start completing tasks to climb the ranks!"),
          ],
        });
        return;
      }

      const medals = ["🥇", "🥈", "🥉"];
      const lines = entries.map((e, i) => {
        const medal = i < 3 ? medals[i] : `${i + 1}.`;
        return `${medal} **${e.username}** — ${e.xp} XP (Lv. ${e.level})`;
      });

      const embed = createEmbed("leaderboard")
        .setTitle(`${scope === "weekly" ? "📅 Weekly" : "🏆 All-Time"} Leaderboard`)
        .setDescription(lines.join("\n"))
        .setFooter({ text: `DevOS • ${scope === "weekly" ? "This week" : "All time"}` });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error({ err: error, guildId }, "Error fetching leaderboard");
      await interaction.editReply({
        embeds: [createErrorEmbed("Failed to fetch leaderboard. Please try again later.")],
      });
    }
  },
});