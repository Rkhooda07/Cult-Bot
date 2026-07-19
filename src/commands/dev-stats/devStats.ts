import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { commands } from "../../registry";
import { createEmbed, createErrorEmbed } from "../../utils/embedFactory";
import { logger } from "../../utils/logger";
import { prisma } from "../../database/prisma";
import {
  fetchContributionCalendar,
  countContributionsToday,
  countGithubXpCommitsToday,
  MAX_XP_COMMITS_PER_DAY,
} from "../../services/githubService";
import { getSolvesToday as getLeetcodeSolvesToday } from "../../services/leetcodeService";
import { fetchSolvedToday as getCodeforcesSolvesToday } from "../../services/codeforcesService";
import { renderContributionGraph } from "../../utils/contributionGraphRenderer";

/**
 * /dev-stats — combined dev-activity dashboard (spec Section 7, Phase 4).
 *
 * Shows today's (UTC) GitHub contributions, LeetCode solves, and Codeforces
 * solves. The GitHub figure comes from the GraphQL contribution calendar, which
 * counts private work too — see countContributionsToday() for why the public
 * events feed was abandoned.
 * Renders correctly for any number of linked integrations:
 *   - 0 linked → a friendly "link something" prompt.
 *   - 1/2/3 linked → one field per linked source; unlinked sources are listed
 *     compactly with a hint so the panel is self-documenting.
 *
 * Live figures are fetched on demand (ephemeral), so a source whose API call
 * fails renders "couldn't fetch" rather than breaking the whole embed.
 */

/** Formats a live "today" count, tolerating a failed (null) fetch. */
function todayLine(count: number | null, noun: string): string {
  if (count === null) return "⚠️ couldn't fetch right now";
  const plural = count === 1 ? noun : `${noun}s`;
  return `**${count}** ${plural} today`;
}

commands.set("dev-stats", {
  data: new SlashCommandBuilder()
    .setName("dev-stats")
    .setDescription("Your combined dev activity today across GitHub, LeetCode, and Codeforces"),

  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Upsert-with-include in one round trip instead of ensureUser() + a separate findUnique.
      const user = await prisma.user.upsert({
        where: { id: interaction.user.id },
        update: { username: interaction.user.username },
        create: { id: interaction.user.id, username: interaction.user.username },
        include: { githubLink: true, leetcodeLink: true, codeforcesLink: true },
      });

      const github = user?.githubLink ?? null;
      const leetcode = user?.leetcodeLink ?? null;
      const codeforces = user?.codeforcesLink ?? null;

      const linkedCount = [github, leetcode, codeforces].filter(Boolean).length;

      // Case: 0 linked — nothing to show, guide them to /link.
      if (linkedCount === 0) {
        await interaction.editReply({
          embeds: [
            createEmbed("stats")
              .setTitle("📈 Dev Stats")
              .setDescription(
                "You haven't linked any dev accounts yet.\n\nUse `/link github`, `/link leetcode`, or `/link codeforces` to start earning XP for your coding activity — and to see it summarized here."
              ),
          ],
        });
        return;
      }

      // Fetch today's figures only for the linked sources, in parallel. The
      // GitHub calendar serves double duty here — it is both the source of the
      // "today" count and the input to the rendered graph, so it is fetched once.
      const [calendar, githubXpAwardsToday, lcSolvesToday, cfSolvesToday] = await Promise.all([
        github ? fetchContributionCalendar(github.username) : Promise.resolve(null),
        github ? countGithubXpCommitsToday(user.id) : Promise.resolve<null>(null),
        leetcode ? getLeetcodeSolvesToday(leetcode.username) : Promise.resolve<null>(null),
        codeforces ? getCodeforcesSolvesToday(codeforces.handle) : Promise.resolve<null>(null),
      ]);

      const contributionsToday = calendar ? countContributionsToday(calendar) : null;

      let graphAttachment: AttachmentBuilder | null = null;
      if (calendar) {
        const graphBuffer = await renderContributionGraph(calendar);
        graphAttachment = new AttachmentBuilder(graphBuffer, { name: "contribution-graph.png" });
      }

      const embed = createEmbed("stats")
        .setTitle("📈 Dev Stats — Today")
        .setThumbnail(interaction.user.displayAvatarURL());

      // Attach the contribution graph if available (shown below the fields).
      if (graphAttachment) {
        embed.setImage("attachment://contribution-graph.png");
      }

      // ── GitHub ────────────────────────────────────────────────────────────
      if (github) {
        // Two distinct numbers, deliberately both shown: what GitHub recorded
        // today (uncapped, includes private work), and how much of the daily XP
        // allowance that actually converted into. Reporting only the former
        // would overstate rewards the way the broadcast copy does (audit N13);
        // reporting only the latter would understate real activity past the cap.
        const lines = [todayLine(contributionsToday, "contribution")];
        if (githubXpAwardsToday !== null) {
          const capped = githubXpAwardsToday >= MAX_XP_COMMITS_PER_DAY;
          lines.push(
            `${githubXpAwardsToday}/${MAX_XP_COMMITS_PER_DAY} XP awards today${capped ? " · daily cap reached" : ""}`
          );
        }
        lines.push(`[@${github.username}](https://github.com/${github.username})`);

        embed.addFields({ name: "📝 GitHub", value: lines.join("\n"), inline: true });
      }

      // ── LeetCode ──────────────────────────────────────────────────────────
      if (leetcode) {
        embed.addFields({
          name: "🧩 LeetCode",
          value: `${todayLine(lcSolvesToday, "solve")}\n[@${leetcode.username}](https://leetcode.com/u/${leetcode.username}/)`,
          inline: true,
        });
      }

      // ── Codeforces ────────────────────────────────────────────────────────
      if (codeforces) {
        const ratingStr =
          codeforces.lastRating !== null && codeforces.lastRating !== undefined
            ? `rating **${codeforces.lastRating}**`
            : "unrated";
        embed.addFields({
          name: "⚔️ Codeforces",
          value: `${todayLine(cfSolvesToday, "solve")}\n[@${codeforces.handle}](https://codeforces.com/profile/${codeforces.handle}) · ${ratingStr}`,
          inline: true,
        });
      }

      // List any not-yet-linked sources so the panel is self-documenting
      // (only when at least one — but not all — are linked).
      const missing: string[] = [];
      if (!github) missing.push("`/link github`");
      if (!leetcode) missing.push("`/link leetcode`");
      if (!codeforces) missing.push("`/link codeforces`");
      if (missing.length > 0) {
        embed.addFields({
          name: "➕ Link more",
          value: missing.join(" · "),
          inline: false,
        });
      }

      if (graphAttachment) {
        await interaction.editReply({ embeds: [embed], files: [graphAttachment] });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (err) {
      logger.error({ err, userId: interaction.user.id }, "Failed to render /dev-stats");
      await interaction.editReply({
        embeds: [createErrorEmbed("Couldn't load your dev stats right now. Please try again.")],
      });
    }
  },
});
