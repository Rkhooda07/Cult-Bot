import cron from "node-cron";
import { Client } from "discord.js";
import { logger } from "../utils/logger";
import { prisma } from "../database/prisma";
import { award } from "../services/xpService";
import { broadcast } from "../services/broadcastService";
import {
  fetchSolvedCount,
  countLeetcodeXpSolvesToday,
  updateLastSolvedCount,
  XP_PER_SOLVE,
  MAX_XP_SOLVES_PER_DAY,
  LEETCODE_XP_REASON,
} from "../services/leetcodeService";

let isRunning = false;

/**
 * LeetCode activity poller — spec Section 7 (Phase 4), Section 10, Section 12.
 *
 * Mirrors githubPoller.ts (Prompt 13). Runs every 15 minutes. For each linked
 * user:
 *   1. Fetch the current total solved count from the LeetCode GraphQL API.
 *   2. Award +25 XP per new solve since lastSolvedCount, capped at 5
 *      XP-awarding solves/day/user.
 *   3. Advance lastSolvedCount so solves are never double-counted.
 *   4. Broadcast via the shared broadcastService (respects per-user opt-out and
 *      per-guild announce-channel config) — same service/embed as GitHub so the
 *      coding-activity channel stays visually consistent across sources.
 *
 * The cap counts XPLog rows (reason "LeetCode solve ...") created today (UTC),
 * so it holds across restarts and across multiple poll cycles within a day.
 */
export function startLeetcodePoller(client: Client): void {
  cron.schedule("*/15 * * * *", async () => {
    if (isRunning) {
      logger.debug("LeetCode poller skipped — previous run still in progress");
      return;
    }

    isRunning = true;

    try {
      const links = await prisma.leetCodeLink.findMany();

      if (links.length === 0) {
        logger.debug("LeetCode poller: no linked accounts");
        return;
      }

      logger.info({ count: links.length }, "LeetCode poller: checking linked accounts");

      for (const link of links) {
        try {
          const activity = await fetchSolvedCount(link.username, link.lastSolvedCount);

          // null = transient API error / user not found; skip this cycle.
          if (!activity) continue;

          // No new solves: keep the stored count fresh if it drifted, else move on.
          if (activity.newSolves === 0) {
            if (activity.totalSolved !== link.lastSolvedCount) {
              await updateLastSolvedCount(link.userId, activity.totalSolved);
            }
            continue;
          }

          const newSolves = activity.newSolves;

          // Apply the daily XP cap against solves already awarded earlier today.
          const alreadyAwardedToday = await countLeetcodeXpSolvesToday(link.userId);
          const remaining = Math.max(0, MAX_XP_SOLVES_PER_DAY - alreadyAwardedToday);
          const solvesToAward = Math.min(newSolves, remaining);

          let totalXp = 0;
          for (let i = 0; i < solvesToAward; i++) {
            await award(link.userId, XP_PER_SOLVE, LEETCODE_XP_REASON);
            totalXp += XP_PER_SOLVE;
          }

          // Always advance past everything we saw this cycle, even solves beyond
          // the cap — otherwise they'd re-award tomorrow.
          await updateLastSolvedCount(link.userId, activity.totalSolved);

          logger.info(
            {
              userId: link.userId,
              username: link.username,
              newSolves,
              solvesAwarded: solvesToAward,
              totalXp,
              cappedOut: solvesToAward < newSolves,
            },
            "LeetCode poller: processed new solves"
          );

          // Broadcast only if XP was actually awarded this cycle. The shared
          // broadcastService handles opt-in/opt-out and produces the same
          // celebratory embed as GitHub.
          if (totalXp > 0) {
            const problemWord = newSolves === 1 ? "problem" : "problems";
            await broadcast(link.userId, {
              emoji: "🧩",
              title: "LeetCode Solved!",
              description: `solved ${newSolves} ${problemWord} today`,
              xpAwarded: totalXp,
            });
          }
        } catch (err) {
          logger.error(
            { err, userId: link.userId, username: link.username },
            "LeetCode poller: error processing linked account"
          );
        }
      }
    } catch (err) {
      logger.error({ err }, "Error in LeetCode poller");
    } finally {
      isRunning = false;
    }
  });

  logger.info("LeetCode poller started (every 15 min)");
}
