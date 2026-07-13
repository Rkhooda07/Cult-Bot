import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { commands } from "../../registry";
import { createEmbed } from "../../utils/embedFactory";
import { getStreak } from "../../services/streakService";
import { ensureUser } from "../../services/reminderService";

commands.set("streak", {
  data: new SlashCommandBuilder()
    .setName("streak")
    .setDescription("View your current and best productivity streaks"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Ensure the user exists in the database
    await ensureUser(userId, username);

    const streak = await getStreak(userId);

    const embed = createEmbed("streaks")
      .setTitle("🔥 Productivity Streak")
      .setDescription(
        `Keep completing tasks, goals, or focus sessions to maintain your streak!\n\n` +
        `Current Streak: **${streak.current}** day${streak.current === 1 ? "" : "s"} 🔥\n` +
        `Best Streak: **${streak.best}** day${streak.best === 1 ? "" : "s"} 🏆`
      )
      .setFooter({ text: `DevOS • ${interaction.user.username}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
});
