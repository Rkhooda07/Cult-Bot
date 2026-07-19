import cron from "node-cron";
import { Client } from "discord.js";
import type { GithubLink } from "@prisma/client";
import { logger } from "../utils/logger";
import { prisma } from "../database/prisma";
import { award } from "../services/xpService";
import { broadcast } from "../services/broadcastService";
import {
  fetchNewCommits,
  fetchContributionCalendar,
  countGithubXpCommitsToday,
  updateLastCommitSha,
  updateLastContributionCount,
  XP_PER_COMMIT,
  XP_PER_PRIVATE_ACTIVITY,
  MAX_XP_COMMITS_PER_DAY,
  GITHUB_XP_REASON,
  GITHUB_PRIVATE_XP_REASON,
} from "../services/githubService";

let isRunning = false;

/**
 * Process a single linked GitHub account for one poll cycle: award XP for new
 * public commits (capped), then always check the contribution calendar for
 * private-repo activity. Extracted from the cron loop so the award/cap/private
 * logic is unit-testable. Errors propagate to the caller, which isolates each
 * user in its own try/catch.
 */
export async function processGithubLink(link: GithubLink): Promise<void> {
  const activity = await fetchNewCommits(link.username, link.lastCommitSha);

  // null = transient API error / user not found; skip this cycle.
  if (!activity) return;

  const newCommitCount = activity.newCommits.length;

  if (newCommitCount > 0) {
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
  } else {
    // Baseline-only (first poll after linking, or no new push events):
    // record the SHA so we have a starting point, award nothing.
    if (activity.latestSha && activity.latestSha !== link.lastCommitSha) {
      await updateLastCommitSha(link.userId, activity.latestSha);
    }
  }

  // --- Private activity detection (GraphQL contribution calendar) ---
  // Runs on EVERY cycle regardless of public commits — a user who only
  // pushed to a private repo has no public PushEvent, so gating this on
  // public commits would make private-only work undetectable (the whole
  // point of the feature). Compare the current contribution total to the
  // stored baseline; any increase beyond the public commits seen this
  // cycle is treated as private activity: +10 XP under the SAME shared
  // daily cap (5/day total combined), plus a detail-free broadcast.
  const calendar = await fetchContributionCalendar(link.username);
  if (calendar) {
    const totalContributions = calendar.totalContributions;

    if (link.lastContributionCount === null || link.lastContributionCount === undefined) {
      // First poll after linking: store the baseline only. Never treat
      // the user's entire prior-year contribution history as one giant
      // private-activity burst.
      await updateLastContributionCount(link.userId, totalContributions);
    } else {
      const prevCount = link.lastContributionCount;
      const totalIncrease = totalContributions - prevCount;

      // Only private activity if the total grew more than the public
      // commits we already counted this cycle.
      if (totalIncrease > newCommitCount) {
        const privateActivityCount = totalIncrease - newCommitCount;

        // Shared daily cap: countGithubXpCommitsToday now counts BOTH
        // public commit awards AND private awards, so private draws from
        // the same 5/day budget rather than getting its own.
        const alreadyAwarded = await countGithubXpCommitsToday(link.userId);
        const remaining = Math.max(0, MAX_XP_COMMITS_PER_DAY - alreadyAwarded);

        if (remaining > 0 && privateActivityCount > 0) {
          // +10 XP for private activity (capped at one award per cycle —
          // multiple private contributions in one cycle still yield a
          // single +10).
          await award(
            link.userId,
            XP_PER_PRIVATE_ACTIVITY,
            GITHUB_PRIVATE_XP_REASON
          );

          // Detail-free variant: no repo name, no commit message.
          await broadcast(link.userId, {
            emoji: "🔒",
            title: "Private Progress!",
            description: "made some private-repo progress today",
            xpAwarded: XP_PER_PRIVATE_ACTIVITY,
          });

          logger.info(
            {
              userId: link.userId,
              username: link.username,
              totalContributions,
              prevCount,
              totalIncrease,
              newCommitCount,
              privateActivityCount,
              xpAwarded: XP_PER_PRIVATE_ACTIVITY,
            },
            "GitHub poller: detected and awarded private activity"
          );
        }
      }

      // Advance the stored baseline to the latest total.
      await updateLastContributionCount(link.userId, totalContributions);
    }
  }
}

/**
 * GitHub activity poller — spec Section 7 (Phase 4), Section 10, Section 12.
 *
 * Runs every 2 minutes. For each linked user:
 *   1. Fetch commits newer than the stored lastCommitSha via the GitHub API.
 *   2. Award +20 XP per new commit, capped at 5 XP-awarding commits/day/user.
 *   3. Advance lastCommitSha so commits are never double-counted.
 *   4. Separately query GitHub's GraphQL API for total contribution count.
 *      If total grew by more than the new public commits detected this cycle,
 *      treat the difference as private activity: award +10 XP under the SAME
 *      shared daily cap (5/day total combined), and broadcast a detail-free
 *      "Private Progress!" embed.
 *   5. Broadcast the activity (broadcastService respects per-user opt-out and
 *      per-guild announce-channel config).
 *
 * The cap counts XPLog rows (reason "GitHub commit ...") created today (UTC),
 * so it holds across restarts and across multiple poll cycles within a day.
 */
export function startGithubPoller(client: Client): void {
  // API cost of this interval — read before shrinking it further.
  //
  // Each cycle makes 2 GitHub API calls per linked user: one REST call for new
  // public commits, one GraphQL call for the contribution count (private-activity
  // detection). At every 2 minutes that is:
  //
  //   30 cycles/hour x 2 calls x N linked users = 60N requests/hour
  //
  // An authenticated token allows 5,000 requests/hour, so this is safe to roughly
  // ~80 linked users (60 x 80 = 4,800). Past that, lengthen the interval again or
  // add batching — do not just shrink this expression. Note the two calls bill
  // against separate quotas (REST vs GraphQL), so 5,000/hr is the conservative
  // read; without GITHUB_TOKEN the unauthenticated REST limit is only 60/hour,
  // which this interval blows through with a single linked user.
  cron.schedule("*/2 * * * *", async () => {
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
          await processGithubLink(link);
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

  logger.info("GitHub poller started (every 2 min)");
}
