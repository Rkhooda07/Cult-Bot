import cron from "node-cron";
import { Client } from "discord.js";
import { logger } from "../utils/logger";
import { prisma } from "../database/prisma";
import { award } from "../services/xpService";
import { broadcast } from "../services/broadcastService";
import {
  fetchCodeforcesActivity,
  countCodeforcesXpSolvesToday,
  updateLastRating,
  XP_PER_SOLVE,
  MAX_XP_SOLVES_PER_DAY,
  CODEFORCES_XP_REASON,
} from "../services/codeforcesService";

let isRunning = false;

/**
 * Codeforces activity poller — spec Section 7 (Phase 4), Section 10, Section 12.
 *
 * Mirrors github/leetcode pollers (Prompts 13-14). Runs every 15 minutes. For
 * each linked user:
 *   1. Fetch today's distinct accepted solves + current rating from the CF API.
 *   2. Award +30 XP per new solve today, capped at 5 XP-awarding solves/day.
 *      Idempotency: "already awarded today" (XPLog count) is subtracted from
 *      "solved today" (API), so re-polling never double-counts and no stored
 *      solve column is needed (see codeforcesService note).
 *   3. Persist the current rating (rating-change detection + /dev-stats).
 *   4. Broadcast via the shared broadcastService — same service/embed as GitHub
 *      and LeetCode so the coding-activity channel stays visually consistent.
 */
export function startCodeforcesPoller(client: Client): void {
  cron.schedule("*/15 * * * *", async () => {
    if (isRunning) {
      logger.debug("Codeforces poller skipped — previous run still in progress");
      return;
    }

    isRunning = true;

    try {
      const links = await prisma.codeforcesLink.findMany();

      if (links.length === 0) {
        logger.debug("Codeforces poller: no linked accounts");
        return;
      }

      logger.info({ count: links.length }, "Codeforces poller: checking linked accounts");

      for (const link of links) {
        try {
          const activity = await fetchCodeforcesActivity(link.handle);

          // null = transient API error / unknown handle; skip this cycle.
          if (!activity) continue;

          // Keep the stored rating fresh regardless of solve activity.
          if (activity.currentRating !== link.lastRating) {
            await updateLastRating(link.userId, activity.currentRating);
          }

          if (activity.solvedToday === 0) continue;

          // How many of today's solves still deserve XP, under the daily cap.
          const alreadyAwardedToday = await countCodeforcesXpSolvesToday(link.userId);
          const cappedTarget = Math.min(activity.solvedToday, MAX_XP_SOLVES_PER_DAY);
          const solvesToAward = Math.max(0, cappedTarget - alreadyAwardedToday);

          if (solvesToAward === 0) continue;

          let totalXp = 0;
          for (let i = 0; i < solvesToAward; i++) {
            await award(link.userId, XP_PER_SOLVE, CODEFORCES_XP_REASON);
            totalXp += XP_PER_SOLVE;
          }

          logger.info(
            {
              userId: link.userId,
              handle: link.handle,
              solvedToday: activity.solvedToday,
              solvesAwarded: solvesToAward,
              totalXp,
              rating: activity.currentRating,
            },
            "Codeforces poller: processed new solves"
          );

          // Broadcast the freshly-awarded solves. broadcastService handles the
          // per-user opt-out and per-guild announce-channel config.
          if (totalXp > 0) {
            const problemWord = solvesToAward === 1 ? "problem" : "problems";
            const ratingSuffix =
              activity.currentRating !== null ? ` (rating ${activity.currentRating})` : "";
            await broadcast(link.userId, {
              emoji: "⚔️",
              title: "Codeforces Submission!",
              description: `solved ${solvesToAward} ${problemWord} today${ratingSuffix}`,
              xpAwarded: totalXp,
            });
          }
        } catch (err) {
          logger.error(
            { err, userId: link.userId, handle: link.handle },
            "Codeforces poller: error processing linked account"
          );
        }
      }
    } catch (err) {
      logger.error({ err }, "Error in Codeforces poller");
    } finally {
      isRunning = false;
    }
  });

  logger.info("Codeforces poller started (every 15 min)");
}
