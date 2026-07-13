import { z } from "zod";
import { prisma } from "../database/prisma";
import { logger } from "../utils/logger";

/**
 * LeetCode integration service — spec Section 7 (Phase 4) + Section 12.
 *
 * Mirrors githubService.ts exactly (Prompt 13): persist the link, poll the
 * public API for the user's total solved count, and provide per-day XP-cap
 * accounting. Polling only, no webhooks (Section 2).
 *
 * LeetCode has no official REST API, so we use their public GraphQL endpoint.
 * `matchedUser.submitStatsGlobal.acSubmissionNum` with difficulty "All" is the
 * cumulative count of accepted (solved) problems.
 */

// LeetCode usernames: letters, digits, underscores, hyphens; 1-40 chars.
export const leetcodeUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid LeetCode username.");

/** +25 XP per new solve, capped at 5 XP-awarding solves/day/user (Section 10). */
export const XP_PER_SOLVE = 25;
export const MAX_XP_SOLVES_PER_DAY = 5;

/** reason prefix for XPLog rows, also used to count today's awarded solves. */
export const LEETCODE_XP_REASON = "LeetCode solve";

export interface LeetCodeActivity {
  /** The user's current cumulative total of solved problems. */
  totalSolved: number;
  /** How many new solves since `sinceCount` (>= 0). */
  newSolves: number;
}

/**
 * Create or update the user's LeetCode link. Returns the stored username.
 * Does not reset lastSolvedCount on re-link so a re-link doesn't replay history.
 */
export async function linkLeetcode(userId: string, username: string): Promise<string> {
  await prisma.leetCodeLink.upsert({
    where: { userId },
    update: { username },
    create: { userId, username },
  });
  return username;
}

export async function getLeetcodeLink(userId: string) {
  return prisma.leetCodeLink.findUnique({ where: { userId } });
}

/**
 * Count how many LeetCode-solve XP awards a user has already received *today*
 * (UTC). Enforces the 5/day cap; counting XPLog rows keyed by reason is the
 * source of truth so the cap survives restarts and multiple poll cycles.
 */
export async function countLeetcodeXpSolvesToday(userId: string): Promise<number> {
  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);

  return prisma.xPLog.count({
    where: {
      userId,
      reason: { startsWith: LEETCODE_XP_REASON },
      createdAt: { gte: startOfUtcDay },
    },
  });
}

/**
 * Update the stored lastSolvedCount after processing new solves.
 */
export async function updateLastSolvedCount(userId: string, count: number): Promise<void> {
  await prisma.leetCodeLink.update({
    where: { userId },
    data: { lastSolvedCount: count },
  });
}

/**
 * Fetch a user's current total solved count from the LeetCode GraphQL API and
 * compute new solves since `sinceCount`.
 *
 * Returns null on network / API error / unknown user so the poller can skip
 * this user this cycle without crashing.
 *
 * @param sinceCount  The last solved count we already awarded for. A freshly
 *                    linked user has lastSolvedCount = 0 (schema default); the
 *                    poller treats the first poll as a baseline (see poller) so
 *                    an established profile's back-catalogue isn't replayed.
 */
export async function fetchSolvedCount(
  username: string,
  sinceCount: number
): Promise<LeetCodeActivity | null> {
  const query = `
    query userProblemsSolved($username: String!) {
      matchedUser(username: $username) {
        submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }
    }`;

  let payload: any;
  try {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "DevOS-Bot",
        Referer: "https://leetcode.com",
      },
      body: JSON.stringify({ query, variables: { username } }),
    });

    if (!res.ok) {
      logger.warn(
        { username, status: res.status },
        "leetcodeService: non-OK response from LeetCode GraphQL"
      );
      return null;
    }
    payload = await res.json();
  } catch (err) {
    logger.error({ err, username }, "leetcodeService: failed to fetch LeetCode stats");
    return null;
  }

  const matchedUser = payload?.data?.matchedUser;
  if (!matchedUser) {
    // null matchedUser = username doesn't exist.
    logger.warn({ username }, "leetcodeService: LeetCode user not found");
    return null;
  }

  const acNums: Array<{ difficulty: string; count: number }> =
    matchedUser?.submitStatsGlobal?.acSubmissionNum ?? [];
  const allEntry = acNums.find((e) => e.difficulty === "All");

  if (!allEntry || typeof allEntry.count !== "number") {
    logger.warn({ username }, "leetcodeService: could not read total solved count");
    return null;
  }

  const totalSolved = allEntry.count;
  // Guard against the count going down (rare, e.g. deleted account resync).
  const newSolves = Math.max(0, totalSolved - sinceCount);

  return { totalSolved, newSolves };
}
