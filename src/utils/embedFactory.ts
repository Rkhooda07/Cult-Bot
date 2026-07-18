import { EmbedBuilder } from "discord.js";
import { ICON_URL } from "../config/branding";

/**
 * Embed color palette — spec Section 6.1.
 * All values are 24-bit integers (0xRRGGBB), which EmbedBuilder.setColor() accepts.
 */
export const COLORS = {
  todo: 0x5865f2,
  goals: 0x9b59b6,
  reminders: 0xe67e22,
  remind: 0xe67e22,
  settings: 0x7289da,
  focus: 0xe74c3c,
  streaks: 0xff6b35,
  stats: 0x2ecc71,
  xp: 0xf1c40f,
  badges: 0x1abc9c,
  leaderboard: 0xf1c40f,
  today: 0x3498db,
  error: 0xed4245,
} as const;

export type ColorDomain = keyof typeof COLORS;

/**
 * Create a base EmbedBuilder pre-wired with the correct domain color,
 * the standard "DevOS" footer, and the current timestamp.
 *
 * Every embed in the bot should start here, then add title / description / fields.
 *
 * @example
 *   const embed = createEmbed("todo").setTitle("📝 Your Todos");
 */
export function createEmbed(domain: ColorDomain): EmbedBuilder {
  // Only pass iconURL when we actually have one — Discord rejects an empty
  // string, so an unset BOT_ICON_URL must omit the field entirely.
  const footer = ICON_URL
    ? { text: "DevOS", iconURL: ICON_URL }
    : { text: "DevOS" };

  return new EmbedBuilder()
    .setColor(COLORS[domain])
    .setFooter(footer)
    .setTimestamp();
}

/**
 * Convenience: create a red error embed with a consistent title.
 * Always reply with `ephemeral: true` for these.
 *
 * @example
 *   await interaction.reply({ embeds: [createErrorEmbed("Invalid date.")], ephemeral: true });
 */
export function createErrorEmbed(message: string): EmbedBuilder {
  return createEmbed("error").setTitle("❌ Error").setDescription(message);
}
