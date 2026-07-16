import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  AutocompleteInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  MessageFlags,
} from "discord.js";
import { z } from "zod";
import { commands, buttonHandlers, modalHandlers, autocompleteHandlers } from "../../registry";
import { createEmbed, createErrorEmbed } from "../../utils/embedFactory";
import { encode, decode } from "../../utils/customId";
import { logger } from "../../utils/logger";
import { getClient } from "../../utils/client";
import * as chrono from "chrono-node";
import {
  createChallenge,
  getChallenge,
  getActiveChallenges,
  joinChallenge,
  completeChallenge,
  getUserChallengeStatus,
} from "../../services/challengeService";

// Modal-input validation (spec Section 10) — every modal submit is zod-validated
// before any DB write. Bounds mirror the modal's own maxLength caps.
const challengeTitleSchema = z.string().trim().min(1).max(100);
const challengeDescriptionSchema = z.string().trim().min(1).max(500);

async function sendOrUpdateAnnouncement(challengeId: string, guildId: string): Promise<void> {
  const challenge = await getChallenge(challengeId);
  if (!challenge) return;

  const client = getClient();
  const settings = await client.guilds.cache.get(guildId);
  if (!settings) return;

  const settingsRecord = await (await import("../../database/prisma")).prisma.guildSettings.findUnique({
    where: { id: guildId },
    select: { announceChannelId: true },
  });

  if (!settingsRecord?.announceChannelId) return;

  const channel = await client.channels
    .fetch(settingsRecord.announceChannelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) return;

  const textChannel = channel as TextChannel;

  const participants = challenge.participants.length;
  const completed = challenge.participants.filter((p) => p.completed).length;

  const embed = createEmbed("xp")
    .setTitle(`🏆 ${challenge.title}`)
    .setDescription(challenge.description)
    .addFields(
      { name: "👥 Participants", value: `${participants}`, inline: true },
      { name: "✅ Completed", value: `${completed}`, inline: true },
      { name: "⏰ Ends", value: `<t:${Math.floor(challenge.endsAt.getTime() / 1000)}:R>`, inline: true }
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encode("challenge", "join", "0", challengeId))
      .setLabel("Join Challenge")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🏁")
  );

  const messages = await textChannel.messages.fetch({ limit: 50 });
  const existingMsg = messages.find(
    (m) => m.embeds.length > 0 && m.embeds[0].title?.includes(challenge.title)
  );

  if (existingMsg) {
    await existingMsg.edit({ embeds: [embed], components: [row] }).catch(() => {});
  } else {
    await textChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
  }
}

commands.set("challenge", {
  data: new SlashCommandBuilder()
    .setName("challenge")
    .setDescription("Community challenges")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a new community challenge (admin only)")
    )
    .addSubcommand((sub) =>
      sub
        .setName("complete")
        .setDescription("Mark your participation in a challenge as complete")
        .addStringOption((opt) =>
          opt
            .setName("challenge")
            .setDescription("Select a challenge")
            .setRequired(true)
            .setAutocomplete(true)
        )
    ) as unknown as SlashCommandBuilder,

  execute: async (interaction: ChatInputCommandInteraction) => {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "create") {
      if (!interaction.memberPermissions?.has("ManageGuild")) {
        await interaction.reply({
          embeds: [createErrorEmbed("You need Manage Server permission to create challenges.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(encode("challenge", "create", interaction.user.id, "new"))
        .setTitle("Create Community Challenge");

      const titleInput = new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Challenge Title")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g., 7-Day Coding Streak")
        .setRequired(true)
        .setMaxLength(100);

      const descriptionInput = new TextInputBuilder()
        .setCustomId("description")
        .setLabel("Description")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("What's the challenge about?")
        .setRequired(true)
        .setMaxLength(500);

      const endDateInput = new TextInputBuilder()
        .setCustomId("endDate")
        .setLabel("End Date (e.g., '7 days', 'next Friday', '2024-12-31')")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("7 days")
        .setRequired(true)
        .setMaxLength(50);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(endDateInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (subcommand === "complete") {
      const guildId = interaction.guildId;
      if (!guildId) {
        await interaction.reply({
          embeds: [createErrorEmbed("This command must be used in a server.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const challenges = await getActiveChallenges(guildId);
      if (challenges.length === 0) {
        await interaction.editReply({
          embeds: [createErrorEmbed("No active challenges in this server.")],
        });
        return;
      }

      const challengeId = interaction.options.getString("challenge", true);
      const challenge = challenges.find((c) => c.id === challengeId);

      if (!challenge) {
        await interaction.editReply({
          embeds: [createErrorEmbed("Challenge not found.")],
        });
        return;
      }

      const status = await getUserChallengeStatus(challengeId, interaction.user.id);
      if (!status.joined) {
        await interaction.editReply({
          embeds: [createErrorEmbed("You haven't joined this challenge yet.")],
        });
        return;
      }

      if (status.completed) {
        await interaction.editReply({
          embeds: [createErrorEmbed("You've already completed this challenge!")],
        });
        return;
      }

      const success = await completeChallenge(challengeId, interaction.user.id);

      if (success) {
        await sendOrUpdateAnnouncement(challengeId, guildId);

        await interaction.editReply({
          embeds: [
            createEmbed("xp")
              .setTitle("✅ Challenge Completed!")
              .setDescription(`You've completed **${challenge.title}**! Great work! 🎉`),
          ],
        });
      } else {
        await interaction.editReply({
          embeds: [createErrorEmbed("Failed to complete challenge. Please try again.")],
        });
      }
    }
  },
});

autocompleteHandlers.set("challenge", async (interaction: AutocompleteInteraction) => {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "challenge") return;

  const guildId = interaction.guildId;
  if (!guildId) return;

  const challenges = await getActiveChallenges(guildId);

  await interaction.respond(
    challenges.slice(0, 25).map((c) => ({
      name: c.title,
      value: c.id,
    }))
  );
});

modalHandlers.set("challenge:create", async (interaction: ModalSubmitInteraction) => {
  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed("This must be used in a server.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const titleResult = challengeTitleSchema.safeParse(interaction.fields.getTextInputValue("title"));
  if (!titleResult.success) {
    await interaction.reply({
      embeds: [createErrorEmbed("Please enter a challenge title (1–100 characters).")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const title = titleResult.data;

  const descriptionResult = challengeDescriptionSchema.safeParse(
    interaction.fields.getTextInputValue("description")
  );
  if (!descriptionResult.success) {
    await interaction.reply({
      embeds: [createErrorEmbed("Please enter a description (1–500 characters).")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const description = descriptionResult.data;

  const endDateStr = interaction.fields.getTextInputValue("endDate");

  const parsed = chrono.parse(endDateStr, new Date(), { forwardDate: true });
  if (parsed.length === 0) {
    await interaction.reply({
      embeds: [createErrorEmbed("Could not parse end date. Try formats like '7 days', 'next Friday', or '2024-12-31'.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const endsAt = parsed[0].start.date();
  if (endsAt <= new Date()) {
    await interaction.reply({
      embeds: [createErrorEmbed("End date must be in the future.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // DB writes + a Discord message fetch/send follow — defer now that all
  // synchronous validation has passed, so the ack lands well inside 3s.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const challenge = await createChallenge(interaction.guildId, title, description, endsAt);

    await sendOrUpdateAnnouncement(challenge.id, interaction.guildId);

    await interaction.editReply({
      embeds: [
        createEmbed("xp")
          .setTitle("✅ Challenge Created!")
          .setDescription(`**${challenge.title}** has been posted to the announcements channel.`),
      ],
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to create challenge");
    await interaction.editReply({
      embeds: [createErrorEmbed("Failed to create challenge. Please try again.")],
    });
  }
});

buttonHandlers.set("challenge:join", async (interaction: ButtonInteraction) => {
  const parsed = decode(interaction.customId);
  const challengeId = parsed.entityId;

  if (!interaction.guildId) {
    await interaction.reply({
      embeds: [createErrorEmbed("This must be used in a server.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // This is a fresh ephemeral reply to the clicking user (the button's own
  // message is a separate public announcement) — defer it now since DB work
  // and a channel message fetch/send follow.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const challenge = await getChallenge(challengeId);
  if (!challenge) {
    await interaction.editReply({
      embeds: [createErrorEmbed("Challenge not found or has ended.")],
    });
    return;
  }

  if (challenge.endsAt < new Date()) {
    await interaction.editReply({
      embeds: [createErrorEmbed("This challenge has already ended.")],
    });
    return;
  }

  const joined = await joinChallenge(challengeId, interaction.user.id);

  if (!joined) {
    await interaction.editReply({
      embeds: [createErrorEmbed("You've already joined this challenge!")],
    });
    return;
  }

  await sendOrUpdateAnnouncement(challengeId, interaction.guildId);

  await interaction.editReply({
    embeds: [
      createEmbed("xp")
        .setTitle("🏁 Joined Challenge!")
        .setDescription(`You've joined **${challenge.title}**. Good luck!`),
    ],
  });
});