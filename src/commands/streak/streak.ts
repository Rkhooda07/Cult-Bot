import { SlashCommandBuilder, ChatInputCommandInteraction, ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { commands, buttonHandlers } from "../../registry";
import { createEmbed } from "../../utils/embedFactory";
import { encode } from "../../utils/customId";
import { getStreak, getGuildStreaks } from "../../services/streakService";
import { ensureUser } from "../../services/reminderService";

commands.set("streak", {
  data: new SlashCommandBuilder()
    .setName("streak")
    .setDescription("View your current and best productivity streaks"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Ensure the user exists in the database
    await ensureUser(userId, username);

    const streak = await getStreak(userId);
    const embed = buildPersonalEmbed(username, streak.current, streak.best);

    // Server streaks are per-guild social data — only offer the view in a guild
    const components = interaction.guildId ? [buildToggleRow(userId, "board")] : [];

    await interaction.editReply({ embeds: [embed], components });
  },
});

// Button handler: streak:board — swap to the guild-wide top streaks view
buttonHandlers.set("streak:board", async (interaction: ButtonInteraction) => {
  await interaction.deferUpdate();

  const guildId = interaction.guildId;
  if (!guildId) return;

  const entries = await getGuildStreaks(guildId);

  const embed = createEmbed("streaks").setTitle("🔥 Server Streaks");
  if (entries.length === 0) {
    embed.setDescription("No active streaks in this server yet. Complete a task, goal, or focus session to start one!");
  } else {
    const medals = ["🥇", "🥈", "🥉"];
    const lines = entries.map((e, i) => {
      const medal = i < 3 ? medals[i] : `${i + 1}.`;
      return `${medal} **${e.username}** — 🔥 ${e.current} day${e.current === 1 ? "" : "s"} (best ${e.best})`;
    });
    embed.setDescription(lines.join("\n"));
  }
  embed.setFooter({ text: "CultBot • Active streaks in this server" });

  await interaction.editReply({ embeds: [embed], components: [buildToggleRow(interaction.user.id, "me")] });
});

// Button handler: streak:me — swap back to the personal streak view
buttonHandlers.set("streak:me", async (interaction: ButtonInteraction) => {
  await interaction.deferUpdate();

  const streak = await getStreak(interaction.user.id);
  const embed = buildPersonalEmbed(interaction.user.username, streak.current, streak.best);

  await interaction.editReply({ embeds: [embed], components: [buildToggleRow(interaction.user.id, "board")] });
});

function buildPersonalEmbed(username: string, current: number, best: number): EmbedBuilder {
  return createEmbed("streaks")
    .setTitle("🔥 Productivity Streak")
    .setDescription(
      `Keep completing tasks, goals, or focus sessions to maintain your streak!\n\n` +
      `Current Streak: **${current}** day${current === 1 ? "" : "s"} 🔥\n` +
      `Best Streak: **${best}** day${best === 1 ? "" : "s"} 🏆`
    )
    .setFooter({ text: `CultBot • ${username}` });
}

function buildToggleRow(userId: string, target: "board" | "me"): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(encode("streak", target, userId))
    .setStyle(ButtonStyle.Secondary);

  if (target === "board") {
    button.setLabel("Server Streaks").setEmoji("🌍");
  } else {
    button.setLabel("My Streak").setEmoji("👤");
  }

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}
