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
import { createEmbed } from "../utils/embedFactory";
import { encode } from "../utils/customId";
import { PaginatedReminders, ReminderItem } from "../services/reminderService";
import { DateTime } from "luxon";

export function createReminderEmbed(
  username: string,
  data: PaginatedReminders,
  userTimezone: string
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] } {
  const { reminders, page, totalPages } = data;

  const embed = createEmbed("reminders")
    .setTitle(`⏰ ${username}'s Reminders`)
    .setDescription(buildReminderList(reminders, userTimezone));

  if (totalPages > 1) {
    embed.setFooter({ text: `Page ${page}/${totalPages} • CultBot` });
  } else {
    embed.setFooter({ text: "CultBot" });
  }

  const components = buildActionRows(reminders, page, totalPages);

  return { embed, components };
}

function buildReminderList(reminders: ReminderItem[], timezone: string): string {
  if (reminders.length === 0) return "*No upcoming reminders — use **Add** to create one.*";

  return reminders
    .map((reminder, idx) => {
      const timeStr = formatReminderTime(reminder.remindAt, timezone);
      return `${idx + 1}. **${reminder.message}** — ⏰ ${timeStr}`;
    })
    .join("\n");
}

function formatReminderTime(remindAt: Date, timezone: string): string {
  const dt = DateTime.fromJSDate(remindAt, { zone: "utc" }).setZone(timezone);
  return dt.toFormat("MMM d, yyyy 'at' h:mm a z");
}

function buildActionRows(
  reminders: ReminderItem[],
  page: number,
  totalPages: number
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  const addBtn = new ButtonBuilder()
    .setCustomId("remind:add:PLACEHOLDER")
    .setLabel("Add")
    .setStyle(ButtonStyle.Success)
    .setEmoji("➕");

  const listBtn = new ButtonBuilder()
    .setCustomId("remind:list:PLACEHOLDER")
    .setLabel("List")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("📋");

  const cancelBtn = new ButtonBuilder()
    .setCustomId("remind:cancel:PLACEHOLDER")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("🗑️")
    .setDisabled(reminders.length === 0);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(addBtn, listBtn, cancelBtn);
  rows.push(actionRow);

  if (totalPages > 1) {
    const pageSelect = new StringSelectMenuBuilder()
      .setCustomId("remind:page:PLACEHOLDER")
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
      .setCustomId("remind:page:PLACEHOLDER:" + String(page - 1))
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1);

    const nextBtn = new ButtonBuilder()
      .setCustomId("remind:page:PLACEHOLDER:" + String(page + 1))
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages);

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);
    rows.push(navRow);
  }

  return rows;
}

export function buildActionRowsWithUserId(
  userId: string,
  data: PaginatedReminders
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const { reminders, page, totalPages } = data;

  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  const addBtn = new ButtonBuilder()
    .setCustomId(encode("remind", "add", userId))
    .setLabel("Add")
    .setStyle(ButtonStyle.Success)
    .setEmoji("➕");

  const listBtn = new ButtonBuilder()
    .setCustomId(encode("remind", "list", userId))
    .setLabel("List")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("📋");

  const cancelBtn = new ButtonBuilder()
    .setCustomId(encode("remind", "cancel", userId))
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("🗑️")
    .setDisabled(reminders.length === 0);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(addBtn, listBtn, cancelBtn);
  rows.push(actionRow);

  if (totalPages > 1) {
    const pageSelect = new StringSelectMenuBuilder()
      .setCustomId(encode("remind", "page", userId))
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
      .setCustomId(encode("remind", "page", userId, String(page - 1)))
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1);

    const nextBtn = new ButtonBuilder()
      .setCustomId(encode("remind", "page", userId, String(page + 1)))
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages);

    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);
    rows.push(navRow);
  }

  return rows;
}

export function createCancelSelectMenu(
  userId: string,
  reminders: ReminderItem[],
  timezone: string
): ActionRowBuilder<StringSelectMenuBuilder> {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(encode("remind", "cancel", userId))
    .setPlaceholder("Select reminder(s) to cancel")
    .setMinValues(1)
    .setMaxValues(reminders.length)
    .addOptions(
      reminders.slice(0, 25).map((reminder, idx) => {
        const timeStr = formatReminderTime(reminder.remindAt, timezone);
        return new StringSelectMenuOptionBuilder()
          .setLabel(`${idx + 1}. ${reminder.message}`)
          .setDescription(timeStr)
          .setValue(reminder.id)
          .setEmoji("🗑️");
      })
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

export function createAddReminderModal(userId: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(encode("remind", "add", userId))
    .setTitle("Add Reminder");

  const messageInput = new TextInputBuilder()
    .setCustomId("message")
    .setLabel("What should I remind you?")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("e.g., Continue FlowPane, Call mom, Take a break")
    .setRequired(true)
    .setMaxLength(200);

  const timeInput = new TextInputBuilder()
    .setCustomId("time")
    .setLabel("When? (natural language)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g., 2h, tomorrow 8am, in 30 minutes, August 30")
    .setRequired(true)
    .setMaxLength(100);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput);
  modal.addComponents(row1, row2);

  return modal;
}