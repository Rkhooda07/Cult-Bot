import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { commands, buttonHandlers } from "../../registry";
import { createEmbed } from "../../utils/embedFactory";
import { encode } from "../../utils/customId";
import { ensureUser, createSession, getActiveSession, completeSession, abandonSession } from "../../services/focusService";
import { award } from "../../services/xpService";
import { logger } from "../../utils/logger";

commands.set("focus", {
  data: new SlashCommandBuilder()
    .setName("focus")
    .setDescription("Start or stop a Pomodoro focus session")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Start a new focus session")
        .addIntegerOption((opt) =>
          opt.setName("minutes").setDescription("Session length in minutes (default 25)").setMinValue(1).setMaxValue(180)
        )
    )
    .addSubcommand((sub) => sub.setName("stop").setDescription("Stop the current focus session")) as unknown as SlashCommandBuilder,

  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "start") {
      await handleFocusStart(interaction);
    } else if (subcommand === "stop") {
      await handleFocusStop(interaction);
    }
  },
});

async function handleFocusStart(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const minutes = interaction.options.getInteger("minutes") || 25;

  // Check for existing active session
  const [, existing] = await Promise.all([
    ensureUser(userId, interaction.user.username),
    getActiveSession(userId),
  ]);
  if (existing) {
    const embed = createEmbed("error").setTitle("Session in progress").setDescription(`You already have a focus session running (started <t:${Math.floor(existing.startedAt.getTime() / 1000)}:R>). Use \`/focus stop\` to end it.`);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const session = await createSession(userId, minutes);
  const embed = buildSessionEmbed(interaction.user, session, minutes);
  const row = buildCompleteButton(userId, session.id);

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleFocusStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  const active = await getActiveSession(userId);
  if (!active) {
    const embed = createEmbed("error").setTitle("No active session").setDescription("You don't have a focus session running.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const abandoned = await abandonSession(active.id, userId);
  if (!abandoned) {
    const embed = createEmbed("error").setTitle("Failed to stop").setDescription("Could not stop the session (already completed?).");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = createEmbed("focus")
    .setTitle("⏹ Focus Session Stopped")
    .setDescription(`Session abandoned after <t:${Math.floor(active.startedAt.getTime() / 1000)}:R>. No XP awarded.`);
  await interaction.editReply({ embeds: [embed] });
}

function buildSessionEmbed(user: { username: string; displayAvatarURL: () => string }, session: { id: string; durationMin: number; startedAt: Date }, minutes: number): EmbedBuilder {
  const endTime = new Date(session.startedAt.getTime() + minutes * 60 * 1000);

  return createEmbed("focus")
    .setTitle("🍅 Focus Session Started")
    .setDescription(`**${minutes} minutes** — stay focused!`)
    .addFields(
      { name: "Started", value: `<t:${Math.floor(session.startedAt.getTime() / 1000)}:T>`, inline: true },
      { name: "Ends", value: `<t:${Math.floor(endTime.getTime() / 1000)}:T>`, inline: true },
      { name: "Session ID", value: `\`${session.id.slice(0, 8)}\``, inline: true }
    )
    .setFooter({ text: `DevOS • ${user.username}` });
}

function buildCompleteButton(userId: string, sessionId: string): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(encode("focus", "complete", userId, sessionId))
    .setLabel("Mark Complete")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✅");

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

// Button handler: focus:complete
buttonHandlers.set("focus:complete", async (interaction) => {
  await interaction.deferUpdate();
  const { ownerId, entityId } = decodeCustomId(interaction.customId);
  if (ownerId !== interaction.user.id) return; // Router already guards, but double-check

  const completed = await completeSession(entityId, ownerId);
  if (!completed) {
    const embed = createEmbed("error").setTitle("Already finished").setDescription("This session was already completed or stopped.");
    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  // Award XP
  const xpResult = await award(ownerId, 25, "focus_session");

  const embed = createEmbed("focus")
    .setTitle("✅ Focus Session Complete!")
    .setDescription(`Great job! You earned **+25 XP**.\nTotal XP: **${xpResult.newXP}** (Level ${xpResult.newLevel})`)
    .setFooter({ text: `DevOS • ${interaction.user.username}` });

  await interaction.editReply({ embeds: [embed], components: [] });

  if (xpResult.leveledUp) {
    const levelUpEmbed = createEmbed("xp")
      .setTitle("🎉 Level Up!")
      .setDescription(`Congratulations, **${interaction.user.username}**! You've leveled up to **Level ${xpResult.newLevel}**!\nKeep up the great work! 🚀`)
      .setThumbnail(interaction.user.displayAvatarURL());

    await interaction.followUp({ embeds: [levelUpEmbed], flags: MessageFlags.Ephemeral });
  }
});

function decodeCustomId(customId: string): { domain: string; action: string; ownerId: string; entityId: string } {
  const [domain = "", action = "", ownerId = "", entityId = "none"] = customId.split(":");
  return { domain, action, ownerId, entityId };
}