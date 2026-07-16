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
  ComponentType,
  MessageFlags,
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
  createTodo,
  getTodosPaginated,
  getAllTodos,
  getIncompleteTodos,
  completeTodo,
  editTodo,
  deleteTodo,
  getTodoStats,
} from "../../services/todoService";
import {
  createTodoEmbed,
  createAddTodoModal,
  createEditTodoModal,
} from "../../embeds/todoEmbed";

const todoContentSchema = z.string().min(1).max(200).trim();

async function renderPanel(
  interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  page = 1
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  const [, data, stats] = await Promise.all([
    ensureUser(userId, username),
    getTodosPaginated(userId, page),
    getTodoStats(userId),
  ]);

  const { embed, components } = createTodoEmbed(userId, username, data, stats);

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components });
  } else {
    await interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
  }
}

commands.set("todo", {
  data: new SlashCommandBuilder()
    .setName("todo")
    .setDescription("Open your personal todo panel"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await renderPanel(interaction, 1);
  },
});

buttonHandlers.set("todo:add", async (interaction: ButtonInteraction) => {
  const modal = createAddTodoModal(interaction.user.id);
  await interaction.showModal(modal);
});

buttonHandlers.set("todo:edit", async (interaction: ButtonInteraction) => {
  const todos = await getAllTodos(interaction.user.id);

  if (todos.length === 0) {
    await interaction.reply({ embeds: [createErrorEmbed("No todos to edit.")], flags: MessageFlags.Ephemeral });
    return;
  }

  if (todos.length === 1) {
    const modal = createEditTodoModal(interaction.user.id, todos[0].id, todos[0].content);
    await interaction.showModal(modal);
    return;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(encode("todo", "edit", interaction.user.id))
    .setPlaceholder("Select todo to edit")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      todos.slice(0, 25).map((todo, idx) => {
        const emoji = todo.done ? "✔" : "☐";
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${emoji} ${idx + 1}. ${todo.content}`.slice(0, 100))
          .setValue(todo.id);
      })
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.reply({ components: [row], flags: MessageFlags.Ephemeral });
});

buttonHandlers.set("todo:delete", async (interaction: ButtonInteraction) => {
  const todos = await getAllTodos(interaction.user.id);

  if (todos.length === 0) {
    await interaction.reply({ embeds: [createErrorEmbed("No todos to delete.")], flags: MessageFlags.Ephemeral });
    return;
  }

  if (todos.length === 1) {
    const customId = encode("todo", "confirmDelete", interaction.user.id, todos[0].id);
    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel("Confirm Delete")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️"),
      new ButtonBuilder()
        .setCustomId(encode("todo", "cancel", interaction.user.id))
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [createEmbed("todo").setTitle("🗑️ Delete Todo").setDescription(`Delete "${todos[0].content}"?`)],
      components: [confirmRow],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(encode("todo", "delete", interaction.user.id))
    .setPlaceholder("Select todo(s) to delete")
    .setMinValues(1)
    .setMaxValues(todos.length)
    .addOptions(
      todos.slice(0, 25).map((todo, idx) => {
        const emoji = todo.done ? "✔" : "☐";
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${emoji} ${idx + 1}. ${todo.content}`.slice(0, 100))
          .setValue(todo.id);
      })
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.reply({ components: [row], flags: MessageFlags.Ephemeral });
});

buttonHandlers.set("todo:complete", async (interaction: ButtonInteraction) => {
  await interaction.deferUpdate();
  const incompleteTodos = await getIncompleteTodos(interaction.user.id);

  if (incompleteTodos.length === 0) {
    await interaction.editReply({ embeds: [createErrorEmbed("No incomplete todos to complete.")], components: [] });
    return;
  }

  if (incompleteTodos.length === 1) {
    const success = await completeTodo(interaction.user.id, incompleteTodos[0].id);
    if (success) {
      await renderPanel(interaction, 1);
    } else {
      await interaction.editReply({ embeds: [createErrorEmbed("Failed to complete todo.")], components: [] });
    }
    return;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(encode("todo", "complete", interaction.user.id))
    .setPlaceholder("Select todo(s) to complete")
    .setMinValues(1)
    .setMaxValues(incompleteTodos.length)
    .addOptions(
      incompleteTodos.slice(0, 25).map((todo, idx) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`☐ ${idx + 1}. ${todo.content}`.slice(0, 100))
          .setValue(todo.id)
      )
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  await interaction.editReply({ embeds: [], components: [row] });
});

buttonHandlers.set("todo:page", async (interaction: ButtonInteraction) => {
  await interaction.deferUpdate();
  const parsed = decode(interaction.customId);
  const page = parseInt(parsed.entityId, 10);
  await renderPanel(interaction, page);
});

buttonHandlers.set("todo:confirmDelete", async (interaction: ButtonInteraction) => {
  await interaction.deferUpdate();
  const parsed = decode(interaction.customId);
  const todoId = parsed.entityId;

  const success = await deleteTodo(interaction.user.id, todoId);

  if (success) {
    await renderPanel(interaction, 1);
  } else {
    await interaction.editReply({ embeds: [createErrorEmbed("Failed to delete todo.")] });
  }
});

buttonHandlers.set("todo:cancel", async (interaction: ButtonInteraction) => {
  await interaction.deferUpdate();
  await renderPanel(interaction, 1);
});

selectHandlers.set("todo:edit", async (interaction: StringSelectMenuInteraction) => {
  const todoId = interaction.values[0];
  const todos = await getAllTodos(interaction.user.id);
  const todo = todos.find((t) => t.id === todoId);

  if (!todo) {
    await interaction.reply({ embeds: [createErrorEmbed("Todo not found.")], flags: MessageFlags.Ephemeral });
    return;
  }

  const modal = createEditTodoModal(interaction.user.id, todo.id, todo.content);
  await interaction.showModal(modal);
});

selectHandlers.set("todo:delete", async (interaction: StringSelectMenuInteraction) => {
  await interaction.deferUpdate();
  const todoIds = interaction.values;

  let deleted = 0;
  for (const todoId of todoIds) {
    const success = await deleteTodo(interaction.user.id, todoId);
    if (success) deleted++;
  }

  if (deleted > 0) {
    await renderPanel(interaction, 1);
  } else {
    await interaction.editReply({ embeds: [createErrorEmbed("Failed to delete todo(s).")] });
  }
});

selectHandlers.set("todo:complete", async (interaction: StringSelectMenuInteraction) => {
  await interaction.deferUpdate();
  const todoIds = interaction.values;

  let completed = 0;
  for (const todoId of todoIds) {
    const success = await completeTodo(interaction.user.id, todoId);
    if (success) completed++;
  }

  if (completed > 0) {
    await renderPanel(interaction, 1);
  } else {
    await interaction.editReply({ embeds: [createErrorEmbed("Failed to complete todo(s).")] });
  }
});

selectHandlers.set("todo:page", async (interaction: StringSelectMenuInteraction) => {
  await interaction.deferUpdate();
  const page = parseInt(interaction.values[0], 10);
  await renderPanel(interaction, page);
});

modalHandlers.set("todo:add", async (interaction: ModalSubmitInteraction) => {
  await interaction.deferUpdate();
  const content = interaction.fields.getTextInputValue("content");

  const parseResult = todoContentSchema.safeParse(content);
  if (!parseResult.success) {
    await interaction.editReply({ embeds: [createErrorEmbed("Task must be 1-200 characters.")], components: [] });
    return;
  }

  await createTodo(interaction.user.id, parseResult.data);
  await renderPanel(interaction, 1);
});

modalHandlers.set("todo:edit", async (interaction: ModalSubmitInteraction) => {
  await interaction.deferUpdate();
  const content = interaction.fields.getTextInputValue("content");
  const parsed = decode(interaction.customId);
  const todoId = parsed.entityId;

  const parseResult = todoContentSchema.safeParse(content);
  if (!parseResult.success) {
    await interaction.editReply({ embeds: [createErrorEmbed("Task must be 1-200 characters.")], components: [] });
    return;
  }

  const success = await editTodo(interaction.user.id, todoId, parseResult.data);

  if (success) {
    await renderPanel(interaction, 1);
  } else {
    await interaction.editReply({ embeds: [createErrorEmbed("Failed to edit todo.")] });
  }
});