import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { createEmbed } from "../utils/embedFactory";
import { encode } from "../utils/customId";
import { PomodoroSessionItem } from "../services/focusService";
import { DateTime } from "luxon";

export function buildSessionEmbed(
  session: PomodoroSessionItem,
  userId: string,
  timezone: string
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const startedAt = DateTime.fromJSDate(session.startedAt, { zone: "utc" }).setZone(timezone);
  const endsAt = startedAt.plus({ minutes: session.durationMin });
  const now = DateTime.now().setZone(timezone);

  const isComplete = now >= endsAt;
  const remainingMs = endsAt.diff(now).toMillis();
  const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
  const remainingSeconds = Math.max(0, Math.floor((remainingMs % 60000) / 1000));

  const statusText = isComplete ? "✅ Complete — click **Mark Complete**" : "🔴 In Progress";

  const embed = createEmbed("focus")
    .setTitle("🍅 Focus Session")
    .setDescription(`**${session.durationMin} min** session started ${startedAt.toFormat("h:mm a")}`)
    .addFields(
      { name: "Status", value: statusText, inline: true },
      { name: "Ends", value: endsAt.toFormat("h:mm a"), inline: true },
      {
        name: "Remaining",
        value: isComplete ? "0:00" : `${remainingMinutes}:${String(remainingSeconds).padStart(2, "0")}`,
        inline: true,
      }
    )
    .setFooter({ text: `CultBot • Session ${session.id.slice(0, 8)}` })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(encode("focus", "complete", userId, session.id))
      .setLabel(isComplete ? "Mark Complete" : "Complete Early")
      .setStyle(ButtonStyle.Success)
      .setDisabled(isComplete === false ? false : false)
  );

  return { embed, row };
}

export function buildSessionStoppedEmbed(durationMin: number): EmbedBuilder {
  return createEmbed("focus")
    .setTitle("🍅 Focus Session Stopped")
    .setDescription(`Session abandoned after **${durationMin} min** planned.`)
    .setColor(0xed4245)
    .setFooter({ text: "CultBot" })
    .setTimestamp();
}

export function buildSessionCompletedEmbed(
  durationMin: number,
  xpResult: { xpGained: number; newXP: number; newLevel: number; leveledUp: boolean }
): EmbedBuilder {
  const embed = createEmbed("focus")
    .setTitle("✅ Focus Session Complete!")
    .setDescription(`**${durationMin} min** session completed.`)
    .addFields(
      { name: "XP Gained", value: `+${xpResult.xpGained}`, inline: true },
      { name: "Total XP", value: xpResult.newXP.toString(), inline: true },
      { name: "Level", value: xpResult.newLevel.toString(), inline: true }
    )
    .setFooter({ text: "CultBot" })
    .setTimestamp();

  if (xpResult.leveledUp) {
    embed.addFields({ name: "🎉 Level Up!", value: `You reached level **${xpResult.newLevel}**!`, inline: false });
  }

  return embed;
}

export function buildNoActiveSessionEmbed(): EmbedBuilder {
  return createEmbed("error")
    .setTitle("No Active Session")
    .setDescription("You don't have a focus session in progress. Use `/focus start` to begin one.")
    .setFooter({ text: "CultBot" })
    .setTimestamp();
}

export function buildSessionAlreadyActiveEmbed(): EmbedBuilder {
  return createEmbed("error")
    .setTitle("Session Already Active")
    .setDescription("You already have a focus session in progress. Use `/focus stop` to abandon it first.")
    .setFooter({ text: "CultBot" })
    .setTimestamp();
}