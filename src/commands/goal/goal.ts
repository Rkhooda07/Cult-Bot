import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { commands, buttonHandlers, selectHandlers, modalHandlers } from "../../registry";
import { createEmbed, createErrorEmbed } from "../../utils/embedFactory";
import { encode, decode } from "../../utils/customId";
import { assertOwner } from "../../utils/permissions";
import { logger } from "../../utils/logger";
import { prisma } from "../../database/prisma";
import { z } from "zod";
import {
  ensureUser,
  createGoal,
  getGoalsPaginated,
  getAllGoals,
  getInProgressGoals,
  updateGoalProgress,
  completeGoal,
  abandonGoal,
  deleteGoal,
} from "../../services/goalService";
import {
  createGoalEmbed,
  buildActionRowsWithUserId,
  createProgressSelectMenu,
  createCompleteSelectMenu,
  createAbandonSelectMenu,
  createDeleteSelectMenu,
  createAddGoalModal,
  createProgressModal,
} from "../../embeds/goalEmbed";

const goalTitleSchema = z.string().min(1).max(100).trim();
const goalProgressSchema = z.coerce.number().min(0).max(100);

async function renderPanel(
  interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  page = 1
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  await ensureUser(userId, username);

  const data = await getGoalsPaginated(userId, page);
  const { embed, components } = createGoalEmbed(username, data);

  const finalComponents = buildActionRowsWithUserId(userId, data);

  if (interaction.isChatInputCommand()) {
    await interaction.reply({ embeds: [embed], components, ephemeral: true });
  } else {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [embed], components });
    } else {
      await interaction.reply({ embeds: [embed], components, ephemeral: true });
    }
  }
}

commands.set("goal", {
  data: new SlashCommandBuilder()
    .setName("goal")
    .setDescription("Open your personal goal panel"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    await renderPanel(interaction, 1);
  },
});

buttonHandlers.set("goal:add", async (interaction: ButtonInteraction) => {
  const modal = createAddGoalModal(interaction.user.id);
  await interaction.showModal(modal);
});

buttonHandlers.set("goal:progress", async (interaction: ButtonInteraction) => {
  const goals = await getAllGoals(interaction.user.id);
  const inProgressGoals = goals.filter((g) => g.status === "IN_PROGRESS");

  if (inProgressGoals.length === 0) {
    await interaction.reply({ embeds: [createErrorEmbed("No in-progress goals to update.")], ephemeral: true });
    return;
  }

  if (inProgressGoals.length === 1) {
    const goal = inProgressGoals[0];
    const modal = createProgressModal(interaction.user.id, goal.id, goal.progress);
    await interaction.showModal(modal);
    return;
  }

  const selectMenu = createProgressSelectMenu(interaction.user.id, goals);
  await interaction.reply({ components: [selectMenu], ephemeral: true });
});

buttonHandlers.set("goal:complete", async (interaction: ButtonInteraction) => {
  const inProgressGoals = await getInProgressGoals(interaction.user.id);

  if (inProgressGoals.length === 0) {
    await interaction.reply({ embeds: [createErrorEmbed("No in-progress goals to complete.")], ephemeral: true });
    return;
  }

  if (inProgressGoals.length === 1) {
    await completeGoal(interaction.user.id, inProgressGoals[0].id);
    await renderPanel(interaction, 1);
    return;
  }

  const selectMenu = createCompleteSelectMenu(interaction.user.id, inProgressGoals);
  await interaction.reply({ components: [selectMenu], ephemeral: true });
});

buttonHandlers.set("goal:abandon", async (interaction: ButtonInteraction) => {
  const inProgressGoals = await getInProgressGoals(interaction.user.id);

  if (inProgressGoals.length === 0) {
    await interaction.reply({ embeds: [createErrorEmbed("No in-progress goals to abandon.")], ephemeral: true });
    return;
  }

  if (inProgressGoals.length === 1) {
    await abandonGoal(interaction.user.id, inProgressGoals[0].id);
    await renderPanel(interaction, 1);
    return;
  }

  const selectMenu = createAbandonSelectMenu(interaction.user.id, inProgressGoals);
  await interaction.reply({ components: [selectMenu], ephemeral: true });
});

buttonHandlers.set("goal:delete", async (interaction: ButtonInteraction) => {
  const goals = await getAllGoals(interaction.user.id);

  if (goals.length === 0) {
    await interaction.reply({ embeds: [createErrorEmbed("No goals to delete.")], ephemeral: true });
    return;
  }

  if (goals.length === 1) {
    const customId = encode("goal", "confirmDelete", interaction.user.id, goals[0].id);
    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel("Confirm Delete")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️"),
      new ButtonBuilder()
        .setCustomId(encode("goal", "cancel", interaction.user.id))
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [createEmbed("goals").setTitle("🗑️ Delete Goal").setDescription(`Delete "${goals[0].title}"?`)],
      components: [confirmRow],
      ephemeral: true,
    });
    return;
  }

  const selectMenu = createDeleteSelectMenu(interaction.user.id, goals);
  await interaction.reply({ components: [selectMenu], ephemeral: true });
});

buttonHandlers.set("goal:page", async (interaction: ButtonInteraction) => {
  const parsed = decode(interaction.customId);
  const page = parseInt(parsed.entityId, 10);
  await renderPanel(interaction, page);
});

buttonHandlers.set("goal:confirmDelete", async (interaction: ButtonInteraction) => {
  const parsed = decode(interaction.customId);
  const goalId = parsed.entityId;

  await deleteGoal(interaction.user.id, goalId);
  await renderPanel(interaction, 1);
});

buttonHandlers.set("goal:cancel", async (interaction: ButtonInteraction) => {
  await renderPanel(interaction, 1);
});

selectHandlers.set("goal:progress", async (interaction: StringSelectMenuInteraction) => {
  const goalId = interaction.values[0];
  const goals = await getAllGoals(interaction.user.id);
  const goal = goals.find((g) => g.id === goalId);

  if (!goal) {
    await interaction.reply({ embeds: [createErrorEmbed("Goal not found.")], ephemeral: true });
    return;
  }

  const modal = createProgressModal(interaction.user.id, goal.id, goal.progress);
  await interaction.showModal(modal);
});

selectHandlers.set("goal:complete", async (interaction: StringSelectMenuInteraction) => {
  const goalIds = interaction.values;

  for (const goalId of goalIds) {
    await completeGoal(interaction.user.id, goalId);
  }

  await renderPanel(interaction, 1);
});

selectHandlers.set("goal:abandon", async (interaction: StringSelectMenuInteraction) => {
  const goalIds = interaction.values;

  for (const goalId of goalIds) {
    await abandonGoal(interaction.user.id, goalId);
  }

  await renderPanel(interaction, 1);
});

selectHandlers.set("goal:delete", async (interaction: StringSelectMenuInteraction) => {
  const goalIds = interaction.values;

  for (const goalId of goalIds) {
    await deleteGoal(interaction.user.id, goalId);
  }

  await renderPanel(interaction, 1);
});

selectHandlers.set("goal:page", async (interaction: StringSelectMenuInteraction) => {
  const page = parseInt(interaction.values[0], 10);
  await renderPanel(interaction, page);
});

modalHandlers.set("goal:add", async (interaction: ModalSubmitInteraction) => {
  const title = interaction.fields.getTextInputValue("title").trim();
  const deadlineInput = interaction.fields.getTextInputValue("deadline").trim() || undefined;

  const titleResult = goalTitleSchema.safeParse(title);
  if (!titleResult.success) {
    await interaction.reply({ embeds: [createErrorEmbed("Goal title must be 1-100 characters.")], ephemeral: true });
    return;
  }

  await createGoal(interaction.user.id, titleResult.data, deadlineInput);
  await renderPanel(interaction, 1);
});

modalHandlers.set("goal:progress", async (interaction: ModalSubmitInteraction) => {
  const progressStr = interaction.fields.getTextInputValue("progress").trim();
  const parsed = decode(interaction.customId);
  const goalId = parsed.entityId;

  const progressResult = goalProgressSchema.safeParse(progressStr);
  if (!progressResult.success) {
    await interaction.reply({ embeds: [createErrorEmbed("Progress must be a number between 0 and 100.")], ephemeral: true });
    return;
  }

  await updateGoalProgress(interaction.user.id, goalId, progressResult.data);
  await renderPanel(interaction, 1);
});