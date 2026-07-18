import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { progressBar } from "../utils/progressBar";
import { createEmbed } from "../utils/embedFactory";
import { encode } from "../utils/customId";
import { PaginatedGoals, GoalItem, getStatusIcon, formatDeadline } from "../services/goalService";

export function createGoalEmbed(
  username: string,
  userId: string,
  data: PaginatedGoals
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] } {
  const { goals, page, totalPages } = data;

  const embed = createEmbed("goals").setTitle(`🎯 ${username}'s Goals`);

  if (goals.length === 0) {
    embed.setDescription("*No goals yet — click **Add** to create one.*");
  } else {
    const description = goals
      .map((goal) => {
        const icon = getStatusIcon(goal.status);
        const progressBarStr = progressBar(goal.progress, 8);
        const deadlineStr = goal.deadline ? ` • Due ${formatDeadline(goal.deadline, "UTC")}` : "";
        return `${icon} **${goal.title}**\n\`${progressBarStr}\` ${goal.progress}%${deadlineStr}`;
      })
      .join("\n\n");

    embed.setDescription(description);
  }

  if (totalPages > 1) {
    embed.setFooter({ text: `Page ${page}/${totalPages} • DevOS` });
  } else {
    embed.setFooter({ text: "DevOS" });
  }

  // Owner-aware rows are the single source of truth: every customId embeds the
  // real userId so the router's assertOwner check passes for the panel owner.
  const components = buildActionRowsWithUserId(userId, data);

  return { embed, components };
}

export function buildActionRowsWithUserId(
  userId: string,
  data: PaginatedGoals
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const { goals, page, totalPages } = data;
  const inProgressGoals = goals.filter((g) => g.status === "IN_PROGRESS");
  const incompleteCount = inProgressGoals.length;
  const totalCount = goals.length;

  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  const addBtn = new ButtonBuilder()
    .setCustomId(encode("goal", "add", userId))
    .setLabel("Add")
    .setStyle(ButtonStyle.Success)
    .setEmoji("➕");

  const progressBtn = new ButtonBuilder()
    .setCustomId(encode("goal", "progress", userId))
    .setLabel("Update Progress")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("📈")
    .setDisabled(incompleteCount === 0);

  const completeBtn = new ButtonBuilder()
    .setCustomId(encode("goal", "complete", userId))
    .setLabel("Complete")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✔")
    .setDisabled(incompleteCount === 0);

  const abandonBtn = new ButtonBuilder()
    .setCustomId(encode("goal", "abandon", userId))
    .setLabel("Abandon")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("⭕")
    .setDisabled(incompleteCount === 0);

  const deleteBtn = new ButtonBuilder()
    .setCustomId(encode("goal", "delete", userId))
    .setLabel("Delete")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🗑️")
    .setDisabled(totalCount === 0);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    addBtn,
    progressBtn,
    completeBtn,
    abandonBtn,
    deleteBtn
  );
  rows.push(actionRow);

  if (totalPages > 1) {
    const pageSelect = new StringSelectMenuBuilder()
      .setCustomId(encode("goal", "page", userId))
      .setPlaceholder(`Page ${page} of ${totalPages}`)
      .addOptions(
        Array.from({ length: totalPages }, (_, i) => i + 1).map((p) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`Page ${p}`)
            .setValue(String(p))
            .setDefault(p === page)
        )
      );

    const pageRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(pageSelect);
    rows.push(pageRow);

    const prevBtn = new ButtonBuilder()
      .setCustomId(encode("goal", "page", userId, String(page - 1)))
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1);

    const nextBtn = new ButtonBuilder()
      .setCustomId(encode("goal", "page", userId, String(page + 1)))
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages);

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);
    rows.push(navRow);
  }

  return rows;
}

export function createProgressSelectMenu(
  userId: string,
  goals: GoalItem[]
): ActionRowBuilder<StringSelectMenuBuilder> {
  const inProgressGoals = goals.filter((g) => g.status === "IN_PROGRESS");

  const select = new StringSelectMenuBuilder()
    .setCustomId(encode("goal", "progress", userId))
    .setPlaceholder("Select goal to update progress")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      inProgressGoals.slice(0, 25).map((goal) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(goal.title.slice(0, 100))
          .setValue(goal.id)
          .setDescription(`${goal.progress}% complete`)
      )
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export function createCompleteSelectMenu(
  userId: string,
  goals: GoalItem[]
): ActionRowBuilder<StringSelectMenuBuilder> {
  const inProgressGoals = goals.filter((g) => g.status === "IN_PROGRESS");

  const select = new StringSelectMenuBuilder()
    .setCustomId(encode("goal", "complete", userId))
    .setPlaceholder("Select goal to complete")
    .setMinValues(1)
    .setMaxValues(inProgressGoals.length)
    .addOptions(
      inProgressGoals.slice(0, 25).map((goal) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(goal.title.slice(0, 100))
          .setValue(goal.id)
          .setDescription(`${goal.progress}% complete`)
      )
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export function createAbandonSelectMenu(
  userId: string,
  goals: GoalItem[]
): ActionRowBuilder<StringSelectMenuBuilder> {
  const inProgressGoals = goals.filter((g) => g.status === "IN_PROGRESS");

  const select = new StringSelectMenuBuilder()
    .setCustomId(encode("goal", "abandon", userId))
    .setPlaceholder("Select goal to abandon")
    .setMinValues(1)
    .setMaxValues(inProgressGoals.length)
    .addOptions(
      inProgressGoals.slice(0, 25).map((goal) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(goal.title.slice(0, 100))
          .setValue(goal.id)
          .setDescription(`${goal.progress}% complete`)
      )
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export function createDeleteSelectMenu(
  userId: string,
  goals: GoalItem[]
): ActionRowBuilder<StringSelectMenuBuilder> {
  const select = new StringSelectMenuBuilder()
    .setCustomId(encode("goal", "delete", userId))
    .setPlaceholder("Select goal(s) to delete")
    .setMinValues(1)
    .setMaxValues(goals.length)
    .addOptions(
      goals.slice(0, 25).map((goal, idx) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${idx + 1}. ${goal.title}`.slice(0, 100))
          .setValue(goal.id)
          .setDescription(getStatusLabel(goal.status))
      )
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export function createAddGoalModal(userId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(encode("goal", "add", userId))
    .setTitle("Add Goal");

  const titleInput = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Goal Title")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("What do you want to achieve?")
    .setRequired(true)
    .setMaxLength(100);

  const deadlineInput = new TextInputBuilder()
    .setCustomId("deadline")
    .setLabel("Deadline (optional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., "30 August", "next Friday", "2 weeks"')
    .setRequired(false)
    .setMaxLength(100);

  const titleRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
  const deadlineRow = new ActionRowBuilder<TextInputBuilder>().addComponents(deadlineInput);

  modal.addComponents(titleRow, deadlineRow);

  return modal;
}

export function createProgressModal(userId: string, goalId: string, currentProgress: number): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(encode("goal", "progress", userId, goalId))
    .setTitle("Update Progress");

  const progressInput = new TextInputBuilder()
    .setCustomId("progress")
    .setLabel("Progress (0-100)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Enter percentage")
    .setRequired(true)
    .setMaxLength(3)
    .setValue(String(currentProgress));

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(progressInput);
  modal.addComponents(row);

  return modal;
}

function getStatusLabel(status: GoalItem["status"]): string {
  switch (status) {
    case "IN_PROGRESS":
      return "In Progress";
    case "COMPLETED":
      return "Complete";
    case "ABANDONED":
      return "Abandoned";
    default:
      return "Unknown";
  }
}