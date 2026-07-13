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
  createReminder,
  getRemindersPaginated,
  getAllUpcomingReminders,
  cancelReminder,
  formatReminderTime,
} from "../../services/reminderService";
import {
  createReminderEmbed,
  buildActionRowsWithUserId,
  createCancelSelectMenu,
  createAddReminderModal,
} from "../../embeds/reminderEmbed";

const remindMessageSchema = z.string().min(1).max(200).trim();
const remindTimeSchema = z.string().min(1).max(100).trim();

async function renderPanel(
  interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
  page = 1
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  await ensureUser(userId, username);

  const data = await getRemindersPaginated(userId, page);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const timezone = user?.timezone || "UTC";

  const { embed, components } = createReminderEmbed(username, data, timezone);
  const finalComponents = buildActionRowsWithUserId(userId, data);

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components: finalComponents });
  } else {
    await interaction.reply({ embeds: [embed], components: finalComponents, flags: MessageFlags.Ephemeral });
  }
}

commands.set("remind", {
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Set a reminder or list upcoming reminders")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Create a new reminder")
        .addStringOption((opt) =>
          opt.setName("message").setDescription("What to remind you about").setRequired(true).setMaxLength(200)
        )
        .addStringOption((opt) =>
          opt.setName("time").setDescription("When to remind (e.g., '2h', 'tomorrow 8am')").setRequired(true).setMaxLength(100)
        )
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("List your upcoming reminders")) as unknown as SlashCommandBuilder,

  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const message = interaction.options.getString("message", true);
      const timeInput = interaction.options.getString("time", true);

      const messageResult = remindMessageSchema.safeParse(message);
      const timeResult = remindTimeSchema.safeParse(timeInput);

      if (!messageResult.success || !timeResult.success) {
        await interaction.editReply({ embeds: [createErrorEmbed("Invalid input.")] });
        return;
      }

      await ensureUser(interaction.user.id, interaction.user.username);

      const result = await createReminder(
        interaction.user.id,
        interaction.channelId,
        messageResult.data,
        timeResult.data
      );

      if ("error" in result) {
        await interaction.editReply({ embeds: [createErrorEmbed(result.error)] });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: interaction.user.id } });
      const timezone = user?.timezone || "UTC";
      const timeStr = formatReminderTime(result.parsedTime, timezone);

      await interaction.editReply({
        embeds: [
          createEmbed("reminders")
            .setTitle("⏰ Reminder Set")
            .setDescription(`I'll remind you: **${result.reminder.message}**`)
            .addFields({ name: "Time", value: timeStr, inline: true }),
        ],
      });
      return;
    }

    if (subcommand === "list") {
      await renderPanel(interaction, 1);
      return;
    }
  },
});

buttonHandlers.set("remind:add", async (interaction: ButtonInteraction) => {
  const modal = createAddReminderModal(interaction.user.id);
  await interaction.showModal(modal);
});

buttonHandlers.set("remind:cancel", async (interaction: ButtonInteraction) => {
  const reminders = await getAllUpcomingReminders(interaction.user.id);

  if (reminders.length === 0) {
    await interaction.reply({ embeds: [createErrorEmbed("No upcoming reminders to cancel.")], flags: MessageFlags.Ephemeral });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: interaction.user.id } });
  const timezone = user?.timezone || "UTC";

  const selectMenu = createCancelSelectMenu(interaction.user.id, reminders, timezone);
  await interaction.reply({ components: [selectMenu], flags: MessageFlags.Ephemeral });
});

buttonHandlers.set("remind:page", async (interaction: ButtonInteraction) => {
  const parsed = decode(interaction.customId);
  const page = parseInt(parsed.entityId, 10);
  await renderPanel(interaction, page);
});

buttonHandlers.set("remind:cancel", async (interaction: ButtonInteraction) => {
  await renderPanel(interaction, 1);
});

selectHandlers.set("remind:cancel", async (interaction: StringSelectMenuInteraction) => {
  const reminderIds = interaction.values;

  let cancelled = 0;
  for (const reminderId of reminderIds) {
    const success = await cancelReminder(interaction.user.id, reminderId);
    if (success) cancelled++;
  }

  if (cancelled > 0) {
    await renderPanel(interaction, 1);
  } else {
    await interaction.reply({ embeds: [createErrorEmbed("Failed to cancel reminder(s).")], flags: MessageFlags.Ephemeral });
  }
});

selectHandlers.set("remind:page", async (interaction: StringSelectMenuInteraction) => {
  const page = parseInt(interaction.values[0], 10);
  await renderPanel(interaction, page);
});

modalHandlers.set("remind:add", async (interaction: ModalSubmitInteraction) => {
  const message = interaction.fields.getTextInputValue("message").trim();
  const timeInput = interaction.fields.getTextInputValue("time").trim();

  const messageResult = remindMessageSchema.safeParse(message);
  const timeResult = remindTimeSchema.safeParse(timeInput);

  if (!messageResult.success || !timeResult.success) {
    await interaction.reply({ embeds: [createErrorEmbed("Invalid input.")], flags: MessageFlags.Ephemeral });
    return;
  }

  await ensureUser(interaction.user.id, interaction.user.username);

  const channelId = interaction.channelId || interaction.user.id;

  const result = await createReminder(
    interaction.user.id,
    channelId,
    messageResult.data,
    timeResult.data
  );

  if ("error" in result) {
    await interaction.reply({ embeds: [createErrorEmbed(result.error)], flags: MessageFlags.Ephemeral });
    return;
  }

  await renderPanel(interaction, 1);
});