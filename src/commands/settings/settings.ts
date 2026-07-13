import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
  PermissionFlagsBits,
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
    )
    .addSubcommand((sub) =>
      sub
        .setName("broadcast")
        .setDescription("Turn dev-activity broadcasts (commits, solves) on or off for you")
        .addStringOption((opt) =>
          opt
            .setName("state")
            .setDescription("Whether your activity may be announced in servers you share with the bot")
            .setRequired(true)
            .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("announce-channel")
        .setDescription("Set the channel where members' dev activity is announced (requires Manage Server)")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("The text channel to post activity broadcasts to")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    ) as unknown as SlashCommandBuilder,

  execute: async (interaction: ChatInputCommandInteraction) => {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "broadcast") {
      const state = interaction.options.getString("state", true);
      const enabled = state === "on";

      await ensureUser(interaction.user.id, interaction.user.username);

      try {
        await prisma.user.update({
          where: { id: interaction.user.id },
          data: { broadcastEnabled: enabled },
        });
      } catch (err) {
        logger.error({ err, userId: interaction.user.id }, "Failed to update broadcastEnabled");
        await interaction.reply({ embeds: [createErrorEmbed("Failed to update broadcast setting.")], ephemeral: true });
        return;
      }

      const desc = enabled
        ? "Your dev activity (commits, LeetCode solves, Codeforces submissions) **will** be announced in servers you share with the bot that have an announce channel configured."
        : "Your dev activity **will not** be announced in any server. You'll still earn XP as normal.";

      await interaction.reply({
        embeds: [
          createEmbed("settings")
            .setTitle(enabled ? "📣 Broadcasts On" : "🔕 Broadcasts Off")
            .setDescription(desc),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "announce-channel") {
      // Guild-only + Manage Server permission (spec Section 5, Section 10).
      if (!interaction.inGuild()) {
        await interaction.reply({
          embeds: [createErrorEmbed("This command can only be used inside a server.")],
          ephemeral: true,
        });
        return;
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          embeds: [createErrorEmbed("You need the **Manage Server** permission to set the announce channel.")],
          ephemeral: true,
        });
        return;
      }

      const channel = interaction.options.getChannel("channel", true);

      try {
        await prisma.guildSettings.upsert({
          where: { id: interaction.guildId! },
          update: { announceChannelId: channel.id },
          create: { id: interaction.guildId!, announceChannelId: channel.id },
        });
      } catch (err) {
        logger.error({ err, guildId: interaction.guildId }, "Failed to set announce channel");
        await interaction.reply({ embeds: [createErrorEmbed("Failed to set the announce channel.")], ephemeral: true });
        return;
      }

      await interaction.reply({
        embeds: [
          createEmbed("settings")
            .setTitle("✅ Announce Channel Set")
            .setDescription(
              `Dev activity from linked members will now be announced in <#${channel.id}>.\n\nMembers can opt out individually with \`/settings broadcast off\`.`
            ),
        ],
        ephemeral: true,
      });
      return;
    }

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