import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { commands, selectHandlers } from "../../registry";
import { createEmbed, createErrorEmbed } from "../../utils/embedFactory";
import { encode } from "../../utils/customId";
import { assertOwner } from "../../utils/permissions";
import { logger } from "../../utils/logger";
import { prisma } from "../../database/prisma";
import { z } from "zod";
import { ensureUser, setUserTimezone, isValidIANATimezone } from "../../services/reminderService";

const timezoneSchema = z.string().min(1).max(50).trim();

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Warsaw",
  "Europe/Moscow",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Seoul",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Brisbane",
  "Pacific/Auckland",
  "Pacific/Fiji",
];

commands.set("settings", {
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Manage your user settings")
    .addSubcommand((sub) =>
      sub
        .setName("timezone")
        .setDescription("Set your timezone for reminders and deadlines")
        .addStringOption((opt) =>
          opt
            .setName("timezone")
            .setDescription("IANA timezone (e.g., America/New_York, Europe/London, UTC)")
            .setRequired(true)
            .setAutocomplete(true)
        )
    ) as unknown as SlashCommandBuilder,

  execute: async (interaction: ChatInputCommandInteraction) => {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "timezone") {
      const input = interaction.options.getString("timezone", true);
      const result = timezoneSchema.safeParse(input);

      if (!result.success) {
        await interaction.reply({ embeds: [createErrorEmbed("Invalid timezone format.")], ephemeral: true });
        return;
      }

      const tz = result.data;

      if (!isValidIANATimezone(tz)) {
        await interaction.reply({
          embeds: [createErrorEmbed(`Invalid timezone: **${tz}**. Use an IANA timezone like \`America/New_York\` or \`Europe/London\`.`)],
          ephemeral: true,
        });
        return;
      }

      await ensureUser(interaction.user.id, interaction.user.username);

      const success = await setUserTimezone(interaction.user.id, tz);

      if (success) {
        await interaction.reply({
          embeds: [createEmbed("settings").setTitle("✅ Timezone Updated").setDescription(`Your timezone is now **${tz}**.`)],
          ephemeral: true,
        });
      } else {
        await interaction.reply({ embeds: [createErrorEmbed("Failed to update timezone.")], ephemeral: true });
      }
      return;
    }
  },
});

commands.set("timezone", {
  data: new SlashCommandBuilder()
    .setName("timezone")
    .setDescription("Set your timezone (alias for /settings timezone)")
    .addStringOption((opt) =>
      opt.setName("timezone").setDescription("IANA timezone (e.g., America/New_York)").setRequired(true).setAutocomplete(true)
    ) as unknown as SlashCommandBuilder,

  execute: async (interaction: ChatInputCommandInteraction) => {
    const tz = interaction.options.getString("timezone", true);
    const result = timezoneSchema.safeParse(tz);

    if (!result.success) {
      await interaction.reply({ embeds: [createErrorEmbed("Invalid timezone format.")], ephemeral: true });
      return;
    }

    if (!isValidIANATimezone(tz)) {
      await interaction.reply({
        embeds: [createErrorEmbed(`Invalid timezone: **${tz}**. Use an IANA timezone like \`America/New_York\` or \`Europe/London\`.`)],
        ephemeral: true,
      });
      return;
    }

    await ensureUser(interaction.user.id, interaction.user.username);
    const success = await setUserTimezone(interaction.user.id, tz);

    if (success) {
      await interaction.reply({
        embeds: [createEmbed("settings").setTitle("✅ Timezone Updated").setDescription(`Your timezone is now **${tz}**.`)],
        ephemeral: true,
      });
    } else {
      await interaction.reply({ embeds: [createErrorEmbed("Failed to update timezone.")], ephemeral: true });
    }
  },
});

selectHandlers.set("settings:timezone", async (interaction: StringSelectMenuInteraction) => {
  const tz = interaction.values[0];

  await ensureUser(interaction.user.id, interaction.user.username);
  const success = await setUserTimezone(interaction.user.id, tz);

  if (success) {
    await interaction.update({
      embeds: [createEmbed("settings").setTitle("✅ Timezone Updated").setDescription(`Your timezone is now **${tz}**.`)],
      components: [],
    });
  } else {
    await interaction.update({ embeds: [createErrorEmbed("Failed to update timezone.")], components: [] });
  }
});