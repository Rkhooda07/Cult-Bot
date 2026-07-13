import cron from "node-cron";
import { Client } from "discord.js";
import { logger } from "../utils/logger";
import { prisma } from "../database/prisma";
import { award } from "../services/xpService";
import { broadcast } from "../services/broadcastService";
import {
  fetchNewCommits,
  countGithubXpCommitsToday,
  updateLastCommitSha,
  XP_PER_COMMIT,
  MAX_XP_COMMITS_PER_DAY,
  GITHUB_XP_REASON,
} from "../services/githubService";

let isRunning = false;

/**
 * GitHub activity poller — spec Section 7 (Phase 4), Section 10, Section 12.
 *
 * Runs every 15 minutes. For each linked user:
 *   1. Fetch commits newer than the stored lastCommitSha via the GitHub API.
 *   2. Award +20 XP per new commit, capped at 5 XP-awarding commits/day/user.
 *   3. Advance lastCommitSha so commits are never double-counted.
 *   4. Broadcast the activity (broadcastService respects per-user opt-out and
 *      per-guild announce-channel config).
 *
 * The cap counts XPLog rows (reason "GitHub commit ...") created today (UTC),
 * so it holds across restarts and across multiple poll cycles within a day.
 */
export function startGithubPoller(client: Client): void {
  cron.schedule("*/15 * * * *", async () => {
    if (isRunning) {
      logger.debug("GitHub poller skipped — previous run still in progress");
      return;
    }

    isRunning = true;

    try {
      const links = await prisma.githubLink.findMany();

      if (links.length === 0) {
        logger.debug("GitHub poller: no linked accounts");
        return;
      }

      logger.info({ count: links.length }, "GitHub poller: checking linked accounts");

      for (const link of links) {
        try {
          const activity = await fetchNewCommits(link.username, link.lastCommitSha);

          // null = transient API error / user not found; skip this cycle.
          if (!activity) continue;

          // Baseline-only first poll (or no push events yet): record the SHA so
          // we have a starting point, award nothing.
          if (activity.newCommits.length === 0) {
            if (activity.latestSha && activity.latestSha !== link.lastCommitSha) {
              await updateLastCommitSha(link.userId, activity.latestSha);
            }
            continue;
          }

          const newCommitCount = activity.newCommits.length;

          // Apply the daily XP cap. We may have already awarded some commits
          // earlier today, so award only up to the remaining allowance.
          const alreadyAwardedToday = await countGithubXpCommitsToday(link.userId);
          const remaining = Math.max(0, MAX_XP_COMMITS_PER_DAY - alreadyAwardedToday);
          const commitsToAward = Math.min(newCommitCount, remaining);

          let totalXp = 0;
          for (let i = 0; i < commitsToAward; i++) {
            const commit = activity.newCommits[i];
            await award(
              link.userId,
              XP_PER_COMMIT,
              `${GITHUB_XP_REASON} (${commit.repoShort})`
            );
            totalXp += XP_PER_COMMIT;
          }

          // Always advance the SHA past everything we saw this cycle, even the
          // commits that exceeded the cap — otherwise they'd re-award tomorrow.
          await updateLastCommitSha(link.userId, activity.latestSha);

          logger.info(
            {
              userId: link.userId,
              username: link.username,
              newCommitCount,
              commitsAwarded: commitsToAward,
              totalXp,
              cappedOut: commitsToAward < newCommitCount,
            },
            "GitHub poller: processed new commits"
          );

          // Broadcast only if XP was actually awarded this cycle (a real,
          // countable contribution). broadcastService handles the opt-in/opt-out.
          if (totalXp > 0) {
            const repo = activity.latestRepo ?? "a repository";
            const commitWord = newCommitCount === 1 ? "commit" : "commits";
            await broadcast(link.userId, {
              emoji: "🚀",
              title: "New Commit Shipped!",
              description: `pushed ${newCommitCount} ${commitWord} to \`${repo}\``,
              xpAwarded: totalXp,
            });
          }
        } catch (err) {
          logger.error(
            { err, userId: link.userId, username: link.username },
            "GitHub poller: error processing linked account"
          );
        }
      }
    } catch (err) {
      logger.error({ err }, "Error in GitHub poller");
    } finally {
      isRunning = false;
    }
  });

  logger.info("GitHub poller started (every 15 min)");
}
