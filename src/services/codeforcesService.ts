import { z } from "zod";
import { prisma } from "../database/prisma";
import { logger } from "../utils/logger";

/**
 * Codeforces integration service — spec Section 7 (Phase 4) + Section 12.
 *
 * Mirrors githubService / leetcodeService (Prompts 13-14): persist the link,
 * poll the public API for activity, and provide per-day XP-cap accounting.
 * Polling only, no webhooks (Section 2).
 *
 * Codeforces has a clean public REST API:
 *   - user.status  → submissions (we count today's distinct accepted problems)
 *   - user.info    → current rating (stored in CodeforcesLink.lastRating)
 *
 * NOTE ON SCHEMA (flagged): the locked CodeforcesLink model (Section 4) has only
 * `handle` + `lastRating` — there is NO stored solve-count column like LeetCode's
 * lastSolvedCount. Rather than deviate from the locked schema by adding one, we
 * make solve XP idempotent *without* persistence: each poll we ask the API how
 * many distinct problems were accepted *today* (UTC), then award only the
 * difference between that and the number of Codeforces-solve XP rows already
 * written today (the daily cap doubles as the dedup key). This self-corrects
 * across poll cycles and restarts. `lastRating` is used for rating-change
 * detection and /dev-stats display.
 */

// Codeforces handles: 3-24 chars, letters/digits and _ . - (per CF rules).
export const codeforcesHandleSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Invalid Codeforces handle.");

/** +30 XP per new accepted solve, capped at 5 XP-awarding solves/day/user. */
export const XP_PER_SOLVE = 30;
export const MAX_XP_SOLVES_PER_DAY = 5;

/** reason prefix for XPLog rows, also used to count (and dedupe) today's solves. */
export const CODEFORCES_XP_REASON = "Codeforces solve";

export interface CodeforcesActivity {
  /** Distinct problems accepted today (UTC). */
  solvedToday: number;
  /** Current rating, or null if the user is unrated. */
  currentRating: number | null;
}

/** Epoch milliseconds for the start of the current UTC day. */
function startOfUtcDayMs(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Create or update the user's Codeforces link. Returns the stored handle.
 * Does not reset lastRating on re-link.
 */
export async function linkCodeforces(userId: string, handle: string): Promise<string> {
  await prisma.codeforcesLink.upsert({
    where: { userId },
    update: { handle },
    create: { userId, handle },
  });
  return handle;
}

export async function getCodeforcesLink(userId: string) {
  return prisma.codeforcesLink.findUnique({ where: { userId } });
}

/**
 * Count how many Codeforces-solve XP awards a user has already received *today*
 * (UTC). Enforces the 5/day cap AND acts as the idempotency key described above.
 */
export async function countCodeforcesXpSolvesToday(userId: string): Promise<number> {
  const startOfUtcDay = new Date(startOfUtcDayMs());

  return prisma.xPLog.count({
    where: {
      userId,
      reason: { startsWith: CODEFORCES_XP_REASON },
      createdAt: { gte: startOfUtcDay },
    },
  });
}

/** Persist the latest known rating (for rating-change detection + /dev-stats). */
export async function updateLastRating(userId: string, rating: number | null): Promise<void> {
  await prisma.codeforcesLink.update({
    where: { userId },
    data: { lastRating: rating },
  });
}

/**
 * Fetch a handle's today's-solves and current rating from the Codeforces API.
 * Returns null on network / API error / unknown handle so the poller can skip
 * this user this cycle without crashing.
 */
export async function fetchCodeforcesActivity(
  handle: string
): Promise<CodeforcesActivity | null> {
  const solvedToday = await fetchSolvedToday(handle);
  if (solvedToday === null) return null;

  const currentRating = await fetchCurrentRating(handle);
  return { solvedToday, currentRating };
}

/**
 * Distinct problems accepted today (UTC). Returns null on error / unknown handle.
 * Exposed for /dev-stats as well as the poller.
 */
export async function fetchSolvedToday(handle: string): Promise<number | null> {
  const sinceMs = startOfUtcDayMs();

  let payload: any;
  try {
    // count is generous but bounded; CF returns newest submissions first.
    const res = await fetch(
      `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=1000`,
      { headers: { "User-Agent": "DevOS-Bot", Accept: "application/json" } }
    );

    if (!res.ok) {
      logger.warn(
        { handle, status: res.status },
        "codeforcesService: non-OK response from user.status"
      );
      return null;
    }
    payload = await res.json();
  } catch (err) {
    logger.error({ err, handle }, "codeforcesService: failed to fetch user.status");
    return null;
  }

  if (payload?.status !== "OK" || !Array.isArray(payload.result)) {
    logger.warn({ handle, comment: payload?.comment }, "codeforcesService: user.status not OK");
    return null;
  }

  const solvedTodayKeys = new Set<string>();
  for (const sub of payload.result) {
    if (sub?.verdict !== "OK") continue;
    if (typeof sub.creationTimeSeconds !== "number") continue;
    if (sub.creationTimeSeconds * 1000 < sinceMs) continue;

    const p = sub.problem ?? {};
    // Unique problem identity; contestId+index is stable, name disambiguates gym/acmsguru.
    const key = `${p.contestId ?? "x"}-${p.index ?? "?"}-${p.name ?? ""}`;
    solvedTodayKeys.add(key);
  }

  return solvedTodayKeys.size;
}

export interface CodeforcesHandleInfo {
  /**
   * true  → handle confirmed to exist.
   * false → CF explicitly reported the handle does not exist.
   * null  → couldn't verify (network/API error); caller should not hard-fail.
   */
  found: boolean | null;
  /** Current rating, or null if unrated / unknown. */
  rating: number | null;
}

/**
 * Look up a handle via user.info: distinguishes "exists (rated/unrated)" from
 * "does not exist" so the link command can give a clean error, and returns the
 * current rating in the same round-trip.
 */
export async function fetchHandleInfo(handle: string): Promise<CodeforcesHandleInfo> {
  try {
    const res = await fetch(
      `https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`,
      { headers: { "User-Agent": "DevOS-Bot", Accept: "application/json" } }
    );
    const payload: any = await res.json().catch(() => null);

    if (payload?.status === "OK" && Array.isArray(payload.result) && payload.result[0]) {
      const rating = payload.result[0].rating;
      return { found: true, rating: typeof rating === "number" ? rating : null };
    }

    // CF returns HTTP 400 + status "FAILED" for a nonexistent handle.
    if (res.status === 400 && payload?.status === "FAILED") {
      return { found: false, rating: null };
    }

    // Anything else (rate limit, 5xx, malformed) — can't confirm either way.
    return { found: null, rating: null };
  } catch (err) {
    logger.error({ err, handle }, "codeforcesService: failed to fetch user.info");
    return { found: null, rating: null };
  }
}

/** Current rating via user.info; null if unrated or on error. */
export async function fetchCurrentRating(handle: string): Promise<number | null> {
  return (await fetchHandleInfo(handle)).rating;
}
