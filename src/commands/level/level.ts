import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { commands } from "../../registry";
import { createEmbed } from "../../utils/embedFactory";
import { progressBar } from "../../utils/progressBar";
import { xpForLevel } from "../../services/xpService";
import { prisma } from "../../database/prisma";

commands.set("level", {
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("View your current level and XP progress bar"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Ensure the user exists in the database
    const user = await prisma.user.upsert({
      where: { id: userId },
      update: { username },
      create: { id: userId, username },
    });

    const currentLevel = user.level;
    const currentXp = user.xp;

    const prevLevelXp = xpForLevel(currentLevel - 1);
    const nextLevelXp = xpForLevel(currentLevel);
    const levelXpDifference = nextLevelXp - prevLevelXp;
    const xpInCurrentLevel = currentXp - prevLevelXp;

    // Calculate percentage progress to next level
    const percent = Math.min(
      Math.max(Math.round((xpInCurrentLevel / levelXpDifference) * 100), 0),
      100
    );

    // Build the progress bar (length 15 for a premium feel)
    const bar = progressBar(percent, 15);

    const embed = createEmbed("xp")
      .setTitle("🏆 Level & XP Progress")
      .setDescription(
        `**Level ${currentLevel}**\n` +
        `Progress to Level ${currentLevel + 1}: **${xpInCurrentLevel}** / **${levelXpDifference} XP**\n\n` +
        `\`${bar}\` (${percent}%)\n\n` +
        `Total XP: **${currentXp} XP**`
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: `DevOS • ${username}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
});
