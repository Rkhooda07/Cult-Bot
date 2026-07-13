import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { commands, buttonHandlers } from "../../registry";
import { createEmbed, createErrorEmbed } from "../../utils/embedFactory";
import { progressBar } from "../../utils/progressBar";
import { getBoard } from "../../services/boardService";
import { decode } from "../../utils/customId";

commands.set("board", {
  data: new SlashCommandBuilder()
    .setName("board")
    .setDescription("View the server todo completion board (shared public view)") as unknown as SlashCommandBuilder,

  execute: async (interaction: ChatInputCommandInteraction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({
        embeds: [createErrorEmbed("This command can only be used in a server.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Public reply, not ephemeral
    await interaction.deferReply();
    await renderBoardPanel(interaction, 1);
  },
});

buttonHandlers.set("board:page", async (interaction: ButtonInteraction) => {
  await interaction.deferUpdate();
  const parsed = decode(interaction.customId);
  const page = parseInt(parsed.entityId, 10);
  await renderBoardPanel(interaction, page);
});

async function renderBoardPanel(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  page: number
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const entries = await getBoard(guildId);
  const totalPages = Math.ceil(entries.length / 8);

  let currentPage = page;
  if (currentPage < 1) currentPage = 1;
  if (totalPages > 0 && currentPage > totalPages) currentPage = totalPages;

  const embed = createEmbed("leaderboard")
    .setTitle("📋 Server Checklist Board");

  if (entries.length === 0) {
    embed.setDescription("No members have registered dev checklists yet. Use `/todo` to start tracking tasks!");
  } else {
    const startIndex = (currentPage - 1) * 8;
    const pageEntries = entries.slice(startIndex, startIndex + 8);
    const lines = pageEntries.map((e, index) => {
      const rank = startIndex + index + 1;
      const bar = progressBar(e.percent, 10);
      return `${rank}. **${e.username}** — 📝 ${e.openCount} open (${e.percent}%)\n\`${bar}\``;
    });
    embed.setDescription(lines.join("\n"));
  }

  if (totalPages > 1) {
    embed.setFooter({ text: `Page ${currentPage}/${totalPages} • DevOS` });
  } else {
    embed.setFooter({ text: "DevOS" });
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (totalPages > 1) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`board:page:public:${currentPage - 1}`)
        .setLabel("◀ Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 1),
      new ButtonBuilder()
        .setCustomId(`board:page:public:${currentPage + 1}`)
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages)
    );
    components.push(row);
  }

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components });
  } else {
    await interaction.reply({ embeds: [embed], components });
  }
}
