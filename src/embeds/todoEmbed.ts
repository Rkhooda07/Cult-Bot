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
import { PaginatedTodos, TodoItem } from "../services/todoService";

export function createTodoEmbed(
  userId: string,
  username: string,
  data: PaginatedTodos,
  stats: { total: number; completed: number; percent: number }
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] } {
  const { todos, page, totalPages } = data;

  const embed = createEmbed("todo")
    .setTitle(`📝 ${username}'s Checklist`);

  if (stats.total > 0) {
    embed.setDescription(buildTodoList(todos));
    const bar = progressBar(stats.percent, 10);
    embed.addFields({
      name: "Progress",
      value: `\`${bar}\` ${stats.percent}%  (${stats.completed}/${stats.total})`,
      inline: false,
    });
  } else {
    embed.setDescription("*No todos yet — click **Add** to create one.*");
  }

  if (totalPages > 1) {
    embed.setFooter({ text: `Page ${page}/${totalPages} • CultBot` });
  } else {
    embed.setFooter({ text: "CultBot" });
  }

  const components = buildActionRows(userId, page, totalPages, todos, stats.total - stats.completed, stats.total);

  return { embed, components };
}

function buildTodoList(todos: TodoItem[]): string {
  if (todos.length === 0) return "";

  return todos
    .map((todo) => {
      const icon = todo.done ? "✔" : "☐";
      const text = todo.done ? `~~${todo.content}~~` : todo.content;
      return `${icon} ${text}`;
    })
    .join("\n");
}

export function buildActionRows(
  userId: string,
  page: number,
  totalPages: number,
  todos: TodoItem[],
  incompleteCount: number,
  totalCount: number
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  const addBtn = new ButtonBuilder()
    .setCustomId(encode("todo", "add", userId))
    .setLabel("Add")
    .setStyle(ButtonStyle.Success)
    .setEmoji("➕");

  const completeBtn = new ButtonBuilder()
    .setCustomId(encode("todo", "complete", userId))
    .setLabel("Complete")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("✔")
    .setDisabled(incompleteCount === 0);

  const editBtn = new ButtonBuilder()
    .setCustomId(encode("todo", "edit", userId))
    .setLabel("Edit")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("✏️")
    .setDisabled(totalCount === 0);

  const deleteBtn = new ButtonBuilder()
    .setCustomId(encode("todo", "delete", userId))
    .setLabel("Delete")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("🗑️")
    .setDisabled(totalCount === 0);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    addBtn,
    completeBtn,
    editBtn,
    deleteBtn
  );
  rows.push(actionRow);

  if (totalPages > 1) {
    const pageSelect = new StringSelectMenuBuilder()
      .setCustomId(encode("todo", "page", userId))
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

    if (page > 1 || page < totalPages) {
      const prevBtn = new ButtonBuilder()
        .setCustomId(encode("todo", "page", userId, String(page - 1)))
        .setLabel("◀ Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 1);

      const nextBtn = new ButtonBuilder()
        .setCustomId(encode("todo", "page", userId, String(page + 1)))
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages);

      const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);
      rows.push(navRow);
    }
  }

  return rows;
}

export function createAddTodoModal(userId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(encode("todo", "add", userId))
    .setTitle("Add Todo");

  const contentInput = new TextInputBuilder()
    .setCustomId("content")
    .setLabel("Task")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("What needs to be done?")
    .setRequired(true)
    .setMaxLength(200);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput);
  modal.addComponents(row);

  return modal;
}

export function createEditTodoModal(userId: string, todoId: string, currentContent: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(encode("todo", "edit", userId, todoId))
    .setTitle("Edit Todo");

  const contentInput = new TextInputBuilder()
    .setCustomId("content")
    .setLabel("Task")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("What needs to be done?")
    .setRequired(true)
    .setMaxLength(200)
    .setValue(currentContent);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput);
  modal.addComponents(row);

  return modal;
}