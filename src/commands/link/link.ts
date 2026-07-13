import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from "discord.js";
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
import {
  linkCodeforces,
  codeforcesHandleSchema,
  fetchHandleInfo,
  updateLastRating,
} from "../../services/codeforcesService";

/**
 * /link — connect external dev accounts (spec Section 7, Phase 4).
 *
 * One command per domain (a single `/link` entry point with per-source
 * subcommands: github, leetcode, codeforces). Linked accounts are polled every
 * 15 min; new activity awards XP and (per Section 12) can broadcast to
 * configured guild channels via the shared broadcastService.
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
    )
    .addSubcommand((sub) =>
      sub
        .setName("codeforces")
        .setDescription("Link your Codeforces account — new solves award XP automatically")
        .addStringOption((opt) =>
          opt
            .setName("handle")
            .setDescription("Your Codeforces handle")
            .setRequired(true)
        )
    ) as unknown as SlashCommandBuilder,

  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "github") {
      const input = interaction.options.getString("username", true);
      const parsed = githubUsernameSchema.safeParse(input);

      if (!parsed.success) {
        await interaction.editReply({
          embeds: [createErrorEmbed("That doesn't look like a valid GitHub username.")],
        });
        return;
      }

      const username = parsed.data;

      try {
        await ensureUser(interaction.user.id, interaction.user.username);
        await linkGithub(interaction.user.id, username);
      } catch (err) {
        logger.error({ err, userId: interaction.user.id }, "Failed to link GitHub account");
        await interaction.editReply({
          embeds: [createErrorEmbed("Failed to link your GitHub account. Please try again.")],
        });
        return;
      }

      await interaction.editReply({
        embeds: [
          createEmbed("stats")
            .setTitle("🔗 GitHub Linked")
            .setDescription(
              `Linked to [**${username}**](https://github.com/${username}).\n\nNew public commits will award **+20 XP** each (up to 5/day) and — if a server you're in has an announce channel set — get celebrated there automatically. Polls run every 15 minutes.`
            ),
        ],
      });
      return;
    }

    if (subcommand === "leetcode") {
      const input = interaction.options.getString("username", true);
      const parsed = leetcodeUsernameSchema.safeParse(input);

      if (!parsed.success) {
        await interaction.editReply({
          embeds: [createErrorEmbed("That doesn't look like a valid LeetCode username.")],
        });
        return;
      }

      const username = parsed.data;

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

    if (subcommand === "codeforces") {
      const input = interaction.options.getString("handle", true);
      const parsed = codeforcesHandleSchema.safeParse(input);

      if (!parsed.success) {
        await interaction.editReply({
          embeds: [createErrorEmbed("That doesn't look like a valid Codeforces handle.")],
        });
        return;
      }

      const handle = parsed.data;

      try {
        await ensureUser(interaction.user.id, interaction.user.username);

        // Verify the handle exists before persisting anything. `found === false`
        // means CF explicitly reported no such handle; `null` means we couldn't
        // check (transient) — in that case we link optimistically rather than
        // block the user on a hiccup.
        const info = await fetchHandleInfo(handle);
        if (info.found === false) {
          await interaction.editReply({
            embeds: [
              createErrorEmbed(
                `Couldn't find a Codeforces user with the handle **${handle}**. Double-check the spelling.`
              ),
            ],
          });
          return;
        }

        await linkCodeforces(interaction.user.id, handle);
        // Baseline the rating so a later rating change is detected against a real
        // starting point rather than the schema default (null).
        await updateLastRating(interaction.user.id, info.rating);

        const rating = info.rating;
        const ratingLine =
          rating !== null ? ` (current rating **${rating}**)` : " (currently unrated)";

        await interaction.editReply({
          embeds: [
            createEmbed("stats")
              .setTitle("🔗 Codeforces Linked")
              .setDescription(
                `Linked to [**${handle}**](https://codeforces.com/profile/${handle})${ratingLine}.\n\nNew accepted solves will award **+30 XP** each (up to 5/day) and — if a server you're in has an announce channel set — get celebrated there automatically. Polls run every 15 minutes.`
              ),
          ],
        });
      } catch (err) {
        logger.error({ err, userId: interaction.user.id }, "Failed to link Codeforces account");
        await interaction.editReply({
          embeds: [createErrorEmbed("Failed to link your Codeforces account. Please try again.")],
        });
      }
      return;
    }
  },
});
