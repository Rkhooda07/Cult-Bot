import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { commands } from "../../registry";
import { createEmbed, createErrorEmbed } from "../../utils/embedFactory";
import { logger } from "../../utils/logger";
import { ensureUser } from "../../services/reminderService";
import { linkGithub, githubUsernameSchema } from "../../services/githubService";
import {
  linkLeetcode,
  leetcodeUsernameSchema,
  fetchSolvedCount,
  updateLastSolvedCount,
} from "../../services/leetcodeService";

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
    )
    .addSubcommand((sub) =>
      sub
        .setName("leetcode")
        .setDescription("Link your LeetCode account — new solves award XP automatically")
        .addStringOption((opt) =>
          opt
            .setName("username")
            .setDescription("Your LeetCode username")
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

    if (subcommand === "leetcode") {
      const input = interaction.options.getString("username", true);
      const parsed = leetcodeUsernameSchema.safeParse(input);

      if (!parsed.success) {
        await interaction.reply({
          embeds: [createErrorEmbed("That doesn't look like a valid LeetCode username.")],
          ephemeral: true,
        });
        return;
      }

      const username = parsed.data;

      // Fetching the profile can be slow; defer so we don't hit the 3s limit.
      await interaction.deferReply({ ephemeral: true });

      try {
        await ensureUser(interaction.user.id, interaction.user.username);
        await linkLeetcode(interaction.user.id, username);

        // Baseline the current solved count so an established profile's back
        // catalogue isn't replayed as XP — only solves *after* linking count.
        // (LeetCodeLink.lastSolvedCount is non-nullable and defaults to 0, so
        // unlike GitHub's nullable SHA we set the baseline here at link time.)
        const activity = await fetchSolvedCount(username, 0);
        if (!activity) {
          await interaction.editReply({
            embeds: [
              createErrorEmbed(
                `Couldn't find a public LeetCode profile for **${username}**. Double-check the username — it's case-sensitive.`
              ),
            ],
          });
          return;
        }
        await updateLastSolvedCount(interaction.user.id, activity.totalSolved);

        await interaction.editReply({
          embeds: [
            createEmbed("stats")
              .setTitle("🔗 LeetCode Linked")
              .setDescription(
                `Linked to [**${username}**](https://leetcode.com/u/${username}/) (**${activity.totalSolved}** solved so far).\n\nNew solves will award **+25 XP** each (up to 5/day) and — if a server you're in has an announce channel set — get celebrated there automatically. Polls run every 15 minutes.`
              ),
          ],
        });
      } catch (err) {
        logger.error({ err, userId: interaction.user.id }, "Failed to link LeetCode account");
        await interaction.editReply({
          embeds: [createErrorEmbed("Failed to link your LeetCode account. Please try again.")],
        });
      }
      return;
    }
  },
});
