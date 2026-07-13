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
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { commands, buttonHandlers, selectHandlers, modalHandlers } from "../../registry";
import { createEmbed, createErrorEmbed } from "../../utils/embedFactory";
import { encode, decode } from "../../utils/customId";
import { logger } from "../../utils/logger";
import { z } from "zod";
import {
  ensureUser,
  createHabit,
  listHabits,
  toggleHabitToday,
  deleteHabit,
  HabitItem,
  habitNameSchema,
} from "../../services/habitService";

// ─── Panel renderer ──────────────────────────────────────────────────────────

async function renderPanel(
  interaction:
    | ChatInputCommandInteraction
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction
): Promise<void> {
  const userId = interaction.user.id;
  const username = interaction.user.username;

  await ensureUser(userId, username);

  const habits = await listHabits(userId);
  const { embed, components } = buildPanelEmbed(userId, username, habits);

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ embeds: [embed], components });
  } else {
    await interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
  }
}

function buildPanelEmbed(
  userId: string,
  username: string,
  habits: HabitItem[]
): { embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = createEmbed("badges") // Section 6.1: no explicit "habit" colour — use badges teal (#1ABC9C) as closest fit for habits
    .setTitle("🌱 Your Habits")
    .setFooter({ text: `DevOS • ${username}` });

  if (habits.length === 0) {
    embed.setDescription(
      "You have no habits yet.\nTap **Add** to create your first habit!"
    );
  } else {
    const lines = habits.map((h) => {
      const check = h.completedToday ? "✅" : "⬜";
      const freq = h.frequency === "DAILY" ? "daily" : "weekly";
      return `${check} **${h.name}** *(${freq})*`;
    });
    embed.setDescription(lines.join("\n"));
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encode("habit", "add", userId))
      .setLabel("Add")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("➕"),
    new ButtonBuilder()
      .setCustomId(encode("habit", "checkoff", userId))
      .setLabel("Check Off")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
      .setDisabled(habits.filter((h) => !h.completedToday).length === 0),
    new ButtonBuilder()
      .setCustomId(encode("habit", "delete", userId))
      .setLabel("Delete")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️")
      .setDisabled(habits.length === 0)
  );

  return { embed, components: [row] };
}

// ─── Slash command ───────────────────────────────────────────────────────────

commands.set("habit", {
  data: new SlashCommandBuilder()
    .setName("habit")
    .setDescription("Open your personal habit panel"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await renderPanel(interaction);
  },
});

// ─── Button: habit:add — Step 1 — Show modal for name only ──────────────────

buttonHandlers.set("habit:add", async (interaction: ButtonInteraction) => {
  const modal = new ModalBuilder()
    .setCustomId(encode("habit", "addName", interaction.user.id))
    .setTitle("Add a New Habit");

  const nameInput = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("Habit name")
    .setPlaceholder("e.g. Morning run, Read 20 pages, Meditate…")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(100)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
  await interaction.showModal(modal);
});

// ─── Modal: habit:addName — Step 2 — Show frequency select ──────────────────

modalHandlers.set("habit:addName", async (interaction: ModalSubmitInteraction) => {
  const rawName = interaction.fields.getTextInputValue("name");

  const parsed = habitNameSchema.safeParse(rawName);
  if (!parsed.success) {
    await interaction.reply({
      embeds: [createErrorEmbed("Habit name must be between 1 and 100 characters.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const name = parsed.data;
  const userId = interaction.user.id;

  // Embed the habit name in the customId entityId slot so it survives until
  // the frequency select fires. Names are URL-encoded to be colon-safe.
  const encodedName = encodeURIComponent(name);
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(encode("habit", "setFreq", userId, encodedName))
    .setPlaceholder("Choose frequency for this habit")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Daily")
        .setDescription("Reset and check off every day")
        .setValue("DAILY")
        .setEmoji("📅"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Weekly")
        .setDescription("Check off once per week")
        .setValue("WEEKLY")
        .setEmoji("📆")
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const embed = createEmbed("badges")
    .setTitle("🌱 Set Frequency")
    .setDescription(`How often do you want to track **${name}**?`);

  await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
});

// ─── Select: habit:setFreq — Step 3 — Create the Habit row ──────────────────

selectHandlers.set("habit:setFreq", async (interaction: StringSelectMenuInteraction) => {
  await interaction.deferUpdate();
  const { entityId, ownerId } = decode(interaction.customId);

  const name = decodeURIComponent(entityId);
  const frequency = interaction.values[0] as "DAILY" | "WEEKLY";

  await ensureUser(ownerId, interaction.user.username);
  await createHabit(ownerId, name, frequency);

  logger.info({ userId: ownerId, name, frequency }, "Habit created via two-step flow");

  // Re-render the panel after creation
  await renderPanel(interaction);
});

// ─── Button: habit:checkoff — single habit auto-checks, multiple shows select ─

buttonHandlers.set("habit:checkoff", async (interaction: ButtonInteraction) => {
  const userId = interaction.user.id;
  const habits = await listHabits(userId);
  const pending = habits.filter((h) => !h.completedToday);

  if (pending.length === 1) {
    await interaction.deferUpdate();
    await toggleHabitToday(userId, pending[0].id);
    await renderPanel(interaction);
    return;
  }

  await interaction.deferUpdate();
  if (pending.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("All habits are already checked off for today! 🎉")],
      components: [],
    });
    return;
  }

  // Multiple pending habits — show select menu
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(encode("habit", "doCheckoff", userId))
    .setPlaceholder("Which habit did you complete today?")
    .setMinValues(1)
    .setMaxValues(pending.length)
    .addOptions(
      pending.slice(0, 25).map((h) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(h.name)
          .setValue(h.id)
          .setDescription(h.frequency === "DAILY" ? "Daily" : "Weekly")
          .setEmoji("⬜")
      )
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  await interaction.editReply({ embeds: [], components: [row] });
});

// ─── Select: habit:doCheckoff ────────────────────────────────────────────────

selectHandlers.set("habit:doCheckoff", async (interaction: StringSelectMenuInteraction) => {
  await interaction.deferUpdate();
  const userId = interaction.user.id;

  for (const habitId of interaction.values) {
    await toggleHabitToday(userId, habitId);
  }

  await renderPanel(interaction);
});

// ─── Button: habit:delete ────────────────────────────────────────────────────

buttonHandlers.set("habit:delete", async (interaction: ButtonInteraction) => {
  const userId = interaction.user.id;
  const habits = await listHabits(userId);

  if (habits.length === 1) {
    await interaction.deferUpdate();
    // Single habit: confirm before deleting
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(encode("habit", "confirmDelete", userId, habits[0].id))
        .setLabel("Confirm Delete")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️"),
      new ButtonBuilder()
        .setCustomId(encode("habit", "cancel", userId))
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );

    const embed = createEmbed("badges")
      .setTitle("🗑️ Delete Habit")
      .setDescription(`Delete **${habits[0].name}**? This will remove all its logs too.`);

    await interaction.editReply({ embeds: [embed], components: [row] });
    return;
  }

  await interaction.deferUpdate();
  if (habits.length === 0) {
    await interaction.editReply({
      embeds: [createErrorEmbed("You have no habits to delete.")],
      components: [],
    });
    return;
  }

  // Multiple habits — select which to delete
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(encode("habit", "doDelete", userId))
    .setPlaceholder("Select habit(s) to delete")
    .setMinValues(1)
    .setMaxValues(habits.length)
    .addOptions(
      habits.slice(0, 25).map((h) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(h.name)
          .setValue(h.id)
          .setDescription(h.frequency === "DAILY" ? "Daily" : "Weekly")
          .setEmoji("🌱")
      )
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  await interaction.editReply({ embeds: [], components: [row] });
});

// ─── Button: habit:confirmDelete ─────────────────────────────────────────────

buttonHandlers.set("habit:confirmDelete", async (interaction: ButtonInteraction) => {
  await interaction.deferUpdate();
  const { entityId } = decode(interaction.customId);
  await deleteHabit(interaction.user.id, entityId);
  await renderPanel(interaction);
});

// ─── Button: habit:cancel ─────────────────────────────────────────────────────

buttonHandlers.set("habit:cancel", async (interaction: ButtonInteraction) => {
  await interaction.deferUpdate();
  await renderPanel(interaction);
});

// ─── Select: habit:doDelete ───────────────────────────────────────────────────

selectHandlers.set("habit:doDelete", async (interaction: StringSelectMenuInteraction) => {
  await interaction.deferUpdate();
  const userId = interaction.user.id;

  for (const habitId of interaction.values) {
    await deleteHabit(userId, habitId);
  }

  await renderPanel(interaction);
});
