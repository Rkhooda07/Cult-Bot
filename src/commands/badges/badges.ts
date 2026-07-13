import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { commands } from "../../registry";
import { createEmbed } from "../../utils/embedFactory";
import { prisma } from "../../database/prisma";

commands.set("badges", {
  data: new SlashCommandBuilder()
    .setName("badges")
    .setDescription("View your earned and locked productivity badges"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Ensure the user exists in the database
    await prisma.user.upsert({
      where: { id: userId },
      update: { username },
      create: { id: userId, username },
    });

    // Fetch all seeded badges from the database
    const allBadges = await prisma.badge.findMany({
      orderBy: { name: "asc" },
    });

    // Fetch the user's earned badges
    const userBadges = await prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
    });

    const earnedKeys = new Set(userBadges.map((ub) => ub.badge.key));

    const embed = createEmbed("badges")
      .setTitle("🏆 Your Productivity Badges")
      .setDescription(
        `Complete tasks, goals, and focus sessions to unlock achievements!\n` +
        `Earned: **${earnedKeys.size}** / **${allBadges.length}**`
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: `DevOS • ${username}` });

    for (const badge of allBadges) {
      const isEarned = earnedKeys.has(badge.key);
      const icon = isEarned ? badge.icon : "🔒";
      const name = isEarned ? `**${badge.name}**` : `*${badge.name} (Locked)*`;
      const description = isEarned ? badge.description : `*${badge.description}*`;
      const status = isEarned ? "🟢 Earned" : "🔴 Locked";

      embed.addFields({
        name: `${icon} ${name}`,
        value: `${description}\n\`${status}\``,
        inline: true,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
});
