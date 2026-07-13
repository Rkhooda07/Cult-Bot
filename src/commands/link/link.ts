import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { commands } from "../../registry";
import { createEmbed, createErrorEmbed } from "../../utils/embedFactory";
import { logger } from "../../utils/logger";
import { ensureUser } from "../../services/reminderService";
import { linkGithub, githubUsernameSchema } from "../../services/githubService";

/**
 * /link — connect external dev accounts (spec Section 7, Phase 4).
 *
 * One command per domain: `github` is the first integration subcommand here;
 * `leetcode` and `codeforces` are added by Prompts 14-15 alongside their pollers.
 * Linked accounts are polled every 15 min; new activity awards XP and (per
 * Section 12) can broadcast to configured guild channels.
 */
commands.set("link", {
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link an external dev account to earn XP from your activity")
    .addSubcommand((sub) =>
      sub
        .setName("github")
        .setDescription("Link your GitHub account — new commits award XP automatically")
        .addStringOption((opt) =>
          opt
            .setName("username")
            .setDescription("Your GitHub username (e.g. octocat)")
            .setRequired(true)
        )
    ) as unknown as SlashCommandBuilder,

  execute: async (interaction: ChatInputCommandInteraction) => {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "github") {
      const input = interaction.options.getString("username", true);
      const parsed = githubUsernameSchema.safeParse(input);

      if (!parsed.success) {
        await interaction.reply({
          embeds: [createErrorEmbed("That doesn't look like a valid GitHub username.")],
          ephemeral: true,
        });
        return;
      }

      const username = parsed.data;

      try {
        await ensureUser(interaction.user.id, interaction.user.username);
        await linkGithub(interaction.user.id, username);
      } catch (err) {
        logger.error({ err, userId: interaction.user.id }, "Failed to link GitHub account");
        await interaction.reply({
          embeds: [createErrorEmbed("Failed to link your GitHub account. Please try again.")],
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        embeds: [
          createEmbed("stats")
            .setTitle("🔗 GitHub Linked")
            .setDescription(
              `Linked to [**${username}**](https://github.com/${username}).\n\nNew public commits will award **+20 XP** each (up to 5/day) and — if a server you're in has an announce channel set — get celebrated there automatically. Polls run every 15 minutes.`
            ),
        ],
        ephemeral: true,
      });
      return;
    }
  },
});
