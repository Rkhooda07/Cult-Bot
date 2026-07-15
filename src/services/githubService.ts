import { z } from "zod";
import { prisma } from "../database/prisma";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * GitHub integration service — spec Section 7 (Phase 4) + Section 12.
 *
 * Responsibilities:
 *  - Persist the user's GithubLink (`/link github <username>`).
 *  - Poll the GitHub public API for a user's most recent public push events.
 *  - Provide the per-day XP cap accounting used by the poller (Section 10).
 *  - Fetch contribution calendar from GitHub GraphQL API for private activity
 *    detection and /dev-stats heatmap rendering.
 *
 * Polling only (no webhooks) per locked decision in Section 2.
 */

// GitHub usernames: 1-39 chars, alphanumeric or single hyphens (not leading/trailing).
export const githubUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(39)
  .regex(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,
    "Invalid GitHub username."
  );

/** +20 XP per new commit, capped at 5 XP-awarding commits/day/user (Section 10). */
export const XP_PER_COMMIT = 20;
export const MAX_XP_COMMITS_PER_DAY = 5;

/** +10 XP for detected private-repo activity, shares the same daily cap as public commits. */
export const XP_PER_PRIVATE_ACTIVITY = 10;

/** reason prefix used for XPLog rows, also used to count today's awarded commits. */
export const GITHUB_XP_REASON = "GitHub commit";

export interface GithubPushActivity {
  /** SHA of the most recent commit across the fetched push events (newest first). */
  latestSha: string;
  /** Commits newer than `sinceSha`, newest first. Empty if none / sinceSha not found. */
  newCommits: GithubCommitSummary[];
  /** The repo name (without owner) of the newest commit, for the broadcast copy. */
  latestRepo: string | null;
}

export interface GithubCommitSummary {
  sha: string;
  repo: string; // "owner/name"
  repoShort: string; // "name"
}

export interface ContributionCalendarData {
  totalContributions: number;
  weeks: Array<{
    contributionDays: Array<{
      date: string;
      contributionCount: number;
    }>;
  }>;
}

/**
 * Create or update the user's GitHub link. Returns the stored username.
 * Does not reset lastCommitSha on re-link so a re-link doesn't replay history.
 */
export async function linkGithub(userId: string, username: string): Promise<string> {
  await prisma.githubLink.upsert({
    where: { userId },
    update: { username },
    create: { userId, username },
  });
  return username;
}

export async function getGithubLink(userId: string) {
  return prisma.githubLink.findUnique({ where: { userId } });
}

/**
 * Count how many GitHub-commit XP awards a user has already received *today*
 * (UTC). Used to enforce the 5/day cap. Counting XPLog rows keyed by reason is
 * the source of truth so the cap survives restarts and multiple poll cycles.
 */
export async function countGithubXpCommitsToday(userId: string): Promise<number> {
  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);

  return prisma.xPLog.count({
    where: {
      userId,
      reason: { startsWith: GITHUB_XP_REASON },
      createdAt: { gte: startOfUtcDay },
    },
  });
}

/**
 * Update the stored lastContributionCount after processing private activity.
 */
export async function updateLastContributionCount(userId: string, count: number): Promise<void> {
  await prisma.githubLink.update({
    where: { userId },
    data: { lastContributionCount: count },
  });
}

/**
 * Update the stored lastCommitSha after processing new commits.
 */
export async function updateLastCommitSha(userId: string, sha: string): Promise<void> {
  await prisma.githubLink.update({
    where: { userId },
    data: { lastCommitSha: sha },
  });
}

/**
 * Fetch a user's recent public PushEvents from the GitHub API and extract the
 * commits newer than `sinceSha`.
 *
 * Uses the public events endpoint (no auth required, but GITHUB_TOKEN is sent
 * when present for a higher rate limit). Returns null on network / API error so
 * the poller can skip this user this cycle without crashing.
 *
 * @param sinceSha  The last commit SHA we already awarded for. When null (first
 *                  poll after linking), we do NOT replay history — we only
 *                  record the latest SHA as a baseline and award nothing.
 */
export async function fetchNewCommits(
  username: string,
  sinceSha: string | null
): Promise<GithubPushActivity | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "DevOS-Bot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  let events: unknown;
  try {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`,
      { headers }
    );

    if (res.status === 404) {
      logger.warn({ username }, "githubService: GitHub user not found (404)");
      return null;
    }
    if (!res.ok) {
      logger.warn(
        { username, status: res.status },
        "githubService: non-OK response from GitHub events API"
      );
      return null;
    }
    events = await res.json();
  } catch (err) {
    logger.error({ err, username }, "githubService: failed to fetch GitHub events");
    return null;
  }

  if (!Array.isArray(events)) {
    logger.warn({ username }, "githubService: unexpected GitHub events payload");
    return null;
  }

  // Flatten commits from PushEvents. GitHub returns events newest-first, and the
  // commits array within a push is oldest-first — so reverse each push to keep a
  // globally newest-first ordering.
  const commits: GithubCommitSummary[] = [];
  for (const ev of events) {
    if (!ev || (ev as any).type !== "PushEvent") continue;
    const repoName: string = (ev as any).repo?.name ?? "";
    const repoShort = repoName.includes("/") ? repoName.split("/")[1] : repoName;
    const pushCommits: any[] = (ev as any).payload?.commits ?? [];
    for (const c of [...pushCommits].reverse()) {
      if (!c?.sha) continue;
      commits.push({ sha: c.sha, repo: repoName, repoShort });
    }
  }

  if (commits.length === 0) {
    return { latestSha: sinceSha ?? "", newCommits: [], latestRepo: null };
  }

  const latestSha = commits[0].sha;
  const latestRepo = commits[0].repoShort || null;

  // First poll after linking: baseline only, don't replay history.
  if (!sinceSha) {
    return { latestSha, newCommits: [], latestRepo };
  }

  // Take everything above the last-seen SHA. If the SHA isn't in the window
  // (e.g. >100 events since), fall back to just the newest commit to avoid
  // over-awarding an unbounded backlog.
  const idx = commits.findIndex((c) => c.sha === sinceSha);
  const newCommits = idx === -1 ? [commits[0]] : commits.slice(0, idx);

  return { latestSha, newCommits, latestRepo };
}

/**
 * Count commits pushed today (UTC) from a user's public PushEvents — used by
 * /dev-stats for a live "today" figure (not the XP-capped number). Returns null
 * on API error so /dev-stats can render a graceful placeholder.
 */
export async function getCommitsToday(username: string): Promise<number | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "DevOS-Bot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);
  const sinceMs = startOfUtcDay.getTime();

  let events: unknown;
  try {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`,
      { headers }
    );
    if (!res.ok) return null;
    events = await res.json();
  } catch (err) {
    logger.error({ err, username }, "githubService: failed to fetch events for getCommitsToday");
    return null;
  }

  if (!Array.isArray(events)) return null;

  let count = 0;
  for (const ev of events) {
    if (!ev || (ev as any).type !== "PushEvent") continue;
    const createdAt = (ev as any).created_at;
    if (!createdAt || new Date(createdAt).getTime() < sinceMs) continue;
    count += ((ev as any).payload?.commits ?? []).length;
  }

  return count;
}

/**
 * Fetch a user's contribution calendar from GitHub's GraphQL API.
 * Returns the full calendar data including totalContributions and weekly breakdown.
 * Returns null on network/API error so callers can handle gracefully.
 *
 * Note: Fine-grained PATs have limited GraphQL API support. If this fails with a
 * permissions error, a classic PAT with just the `read:user` scope is required
 * for this specific call. The existing GITHUB_TOKEN env var is used.
 */
export async function fetchContributionCalendar(username: string): Promise<ContributionCalendarData | null> {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "DevOS-Bot",
  };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables: { login: username } }),
    });

    if (!res.ok) {
      logger.warn(
        { username, status: res.status },
        "githubService: non-OK response from GitHub GraphQL API"
      );
      return null;
    }

    const payload = await res.json() as any;

    if (payload.errors) {
      logger.warn(
        { username, errors: payload.errors },
        "githubService: GraphQL errors from contribution calendar query"
      );
      // Fine-grained PATs may lack GraphQL permissions; surface this in logs
      if (payload.errors.some((e: any) => e.type === "FORBIDDEN" || e.message?.includes("permission"))) {
        logger.error(
          { username },
          "githubService: GitHub token may lack GraphQL API scope (fine-grained PATs have limited GraphQL support). Use a classic PAT with read:user scope for this call."
        );
      }
      return null;
    }

    const calendar = payload?.data?.user?.contributionsCollection?.contributionCalendar;
    if (!calendar) {
      logger.warn({ username }, "githubService: no contribution calendar data returned (user not found?)");
      return null;
    }

    return {
      totalContributions: calendar.totalContributions,
      weeks: calendar.weeks.map((w: any) => ({
        contributionDays: w.contributionDays.map((d: any) => ({
          date: d.date,
          contributionCount: d.contributionCount,
        })),
      })),
    };
  } catch (err) {
    logger.error({ err, username }, "githubService: failed to fetch contribution calendar");
    return null;
  }
}